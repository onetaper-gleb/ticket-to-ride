import { describe, expect, it } from 'vitest';
import { CITIES, EDGES } from '../data/europe';
import { EUROPE_CITY_POSITIONS } from '../data/europe-geography';
import {
  cityLabels,
  presentationCities,
  routeLayouts,
  type CityLabel,
  type MapPoint,
} from './board-layout';
import {
  convexHull,
  physicalBoard,
  pointPolygonGap,
  polygonClearance,
  printedVertices,
  projectedFootprint,
  rectangle,
  segmentPolygonGap,
  type PhysicalShape,
} from './board-test-geometry';

const GAP = 0.015;
const EPSILON = 1e-6;
// The marked leader's 3.8px stroke on the 3072px / 24-unit atlas is the widest ink.
const LEADER_RADIUS = (3.8 / 2) * (24 / 3072);
const PRINTED_ROUTE_RADIUS = 0.03 / 2;
const SELECTED_ROUTE_RADIUS = 0.09 / 2;
const CITY_RIM = 0.16;
type Conflict = { a: string; b: string; clearance: number };
type LeaderLabel = CityLabel & { leader?: MapPoint[] };
type Bounds = { left: number; right: number; top: number; bottom: number };
type FootprintObstacle = { id: string; footprint: MapPoint[]; bounds: Bounds };
type RouteSegment = { id: string; a: MapPoint; b: MapPoint; bounds: Bounds };

function boundsOf(points: MapPoint[]): Bounds {
  return {
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.z)),
    bottom: Math.max(...points.map((point) => point.z)),
  };
}

function boundsGap(a: Bounds, b: Bounds) {
  return Math.hypot(
    Math.max(0, a.left - b.right, b.left - a.right),
    Math.max(0, a.top - b.bottom, b.top - a.bottom),
  );
}

function collectStrokeConflicts(
  conflicts: Conflict[],
  segments: RouteSegment[],
  obstacles: FootprintObstacle[],
  radius: number,
) {
  for (const segment of segments) {
    for (const obstacle of obstacles) {
      if (boundsGap(segment.bounds, obstacle.bounds) >= radius + GAP) continue;
      const clearance = segmentPolygonGap(segment.a, segment.b, obstacle.footprint) - radius;
      if (clearance < GAP - EPSILON) conflicts.push({ a: segment.id, b: obstacle.id, clearance });
    }
  }
}

function strokeCapsule(a: MapPoint, b: MapPoint, strokeRadius = PRINTED_ROUTE_RADIUS): MapPoint[] {
  const sides = 32;
  const radius = strokeRadius / Math.cos(Math.PI / sides);
  return convexHull(
    [a, b].flatMap((point) =>
      Array.from({ length: sides }, (_, index) => ({
        x: point.x + Math.cos((index * Math.PI * 2) / sides) * radius,
        z: point.z + Math.sin((index * Math.PI * 2) / sides) * radius,
      })),
    ),
  );
}

function polygonIntersection(subject: MapPoint[], clip: MapPoint[]): MapPoint[] {
  const side = (a: MapPoint, b: MapPoint, point: MapPoint) =>
    (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
  let output = subject;
  for (const [index, a] of clip.entries()) {
    const b = clip[(index + 1) % clip.length];
    const input = output;
    output = [];
    if (!input.length) break;
    for (const [pointIndex, point] of input.entries()) {
      const previous = input[(pointIndex + input.length - 1) % input.length];
      const pointSide = side(a, b, point);
      const previousSide = side(a, b, previous);
      if (pointSide >= 0 !== previousSide >= 0) {
        const t = previousSide / (previousSide - pointSide);
        output.push({
          x: previous.x + (point.x - previous.x) * t,
          z: previous.z + (point.z - previous.z) * t,
        });
      }
      if (pointSide >= 0) output.push(point);
    }
  }
  return output;
}

function assertClear(conflicts: Conflict[]) {
  expect(
    conflicts.length,
    `${conflicts.length} clearance failures: ${JSON.stringify(conflicts.slice(0, 16))}`,
  ).toBe(0);
}

function collectConflict(
  conflicts: Conflict[],
  a: string,
  b: string,
  one: MapPoint[],
  two: MapPoint[],
  gap = GAP,
) {
  const clearance = polygonClearance(one, two);
  if (clearance < gap - EPSILON) conflicts.push({ a, b, clearance });
}

describe('independent physical Europe clearance', () => {
  const cities = presentationCities(CITIES);
  const routes = routeLayouts(EDGES, cities);
  const labels: LeaderLabel[] = cityLabels(cities, routes);
  const board = physicalBoard(routes, cities);
  const carriages = board.slots.flatMap((slot) => [slot.empty, slot.occupied]);
  const labelShapes = labels.map((label) => ({
    id: `${label.city.id} label`,
    label,
    footprint: rectangle(label, label.width, label.height),
  }));
  const footprintObstacle = (shape: { id: string; footprint: MapPoint[] }): FootprintObstacle => ({
    ...shape,
    bounds: boundsOf(shape.footprint),
  });
  const plateObstacles = labelShapes.map(footprintObstacle);
  const stationObstacles = board.cities.map(({ city, station }) => ({
    cityId: city.id,
    ...footprintObstacle(station),
  }));
  const seatObstacles = board.slots.flatMap((slot) =>
    [slot.empty, slot.occupied].map((shape) => ({
      edgeId: slot.edgeId,
      ...footprintObstacle(shape),
    })),
  );
  const routeSegments = routes.map((route) => ({
    route,
    segments: (route.inkPaths ?? [route.points]).flatMap((path, pathIndex) =>
      path.slice(1).map((b, index): RouteSegment => {
        const a = path[index];
        return {
          id: `${route.edge.id} ink[${pathIndex}:${index}]`,
          a,
          b,
          bounds: boundsOf([a, b]),
        };
      }),
    ),
  }));
  const visibleCapsules = routeSegments.flatMap(({ route, segments }) =>
    segments.map((segment) => {
      const footprint = strokeCapsule(segment.a, segment.b);
      return { ...segment, route, footprint, bounds: boundsOf(footprint) };
    }),
  );

  it('retains all 47 city IDs, 101 physical routes and 299 seats without mutating game data', () => {
    const citiesBefore = structuredClone(CITIES);
    const edgesBefore = structuredClone(EDGES);
    const copies = presentationCities(CITIES);
    const layouts = routeLayouts(EDGES, copies);
    expect(copies.map((city) => city.id).sort()).toEqual(CITIES.map((city) => city.id).sort());
    expect(copies).toHaveLength(47);
    expect(layouts).toHaveLength(101);
    expect(board.slots).toHaveLength(299);
    expect(new Set(layouts.map((route) => route.edge.id)).size).toBe(101);
    expect(CITIES).toEqual(citiesBefore);
    expect(EDGES).toEqual(edgesBefore);
    for (const route of layouts) {
      expect(route.edge).toEqual(EDGES.find((edge) => edge.id === route.edge.id));
      expect(route.slots, route.edge.id).toHaveLength(route.edge.length);
    }
  });

  it('does not obtain clearance by shrinking labels or the chosen miniature scale', () => {
    for (const route of routes) {
      expect(route.coachLength, route.edge.id).toBeGreaterThanOrEqual(0.38 - EPSILON);
      expect(route.width, route.edge.id).toBeGreaterThanOrEqual(route.coachLength * 0.46 - EPSILON);
    }
    for (const label of labels) {
      expect(label.height, label.city.id).toBeGreaterThanOrEqual(0.38 - EPSILON);
      expect(label.width, label.city.id).toBeGreaterThanOrEqual(
        Math.min(2.2, 0.25 + label.city.name.length * 0.118) - EPSILON,
      );
    }
  });

  it('starts and ends all 101 printed paths at their own a/b marker rims', () => {
    const lookup = new Map(cities.map((city) => [city.id, city]));
    for (const route of routes) {
      expect(route.points.length, route.edge.id).toBeGreaterThanOrEqual(2);
      for (const point of route.points)
        expect(Number.isFinite(point.x) && Number.isFinite(point.z), route.edge.id).toBe(true);
      const first = route.points[0];
      const last = route.points[route.points.length - 1];
      if (!first || !last) continue;
      if (route.inkPaths) {
        expect(route.inkPaths.length, `${route.edge.id} visible paths`).toBeGreaterThan(0);
        expect(route.inkPaths[0]?.[0], `${route.edge.id} visible departure`).toEqual(first);
        expect(route.inkPaths.at(-1)?.at(-1), `${route.edge.id} visible arrival`).toEqual(last);
      }
      for (const [endpoint, cityId] of [
        [first, route.edge.a],
        [last, route.edge.b],
      ] as const) {
        const city = lookup.get(cityId)!;
        expect(
          Math.hypot(endpoint.x - city.x, endpoint.z - city.z),
          `${route.edge.id} own ${cityId} marker rim`,
        ).toBeCloseTo(CITY_RIM, 5);
      }
    }
  });

  it.each([
    ['printed .03', PRINTED_ROUTE_RADIUS],
    ['selected .09', SELECTED_ROUTE_RADIUS],
  ] as const)('keeps every %s path clear of all plates and foreign full stations', (_, radius) => {
    const conflicts: Conflict[] = [];
    for (const { route, segments } of routeSegments) {
      collectStrokeConflicts(conflicts, segments, plateObstacles, radius);
      collectStrokeConflicts(
        conflicts,
        segments,
        stationObstacles.filter(({ cityId }) => ![route.edge.a, route.edge.b].includes(cityId)),
        radius,
      );
    }
    assertClear(conflicts);
  });

  it('keeps every printed .03 path clear of all foreign free and occupied seats', () => {
    const conflicts: Conflict[] = [];
    for (const { route, segments } of routeSegments)
      collectStrokeConflicts(
        conflicts,
        segments,
        seatObstacles.filter(({ edgeId }) => edgeId !== route.edge.id),
        PRINTED_ROUTE_RADIUS,
      );
    assertClear(conflicts);
  });

  it('does not intersect any two visible route strokes outside their shared city marker rims', () => {
    const conflicts: Conflict[] = [];
    const cells = new Map<string, number[]>();
    const cellSize = 0.25;
    for (const [index, capsule] of visibleCapsules.entries()) {
      for (
        let x = Math.floor(capsule.bounds.left / cellSize);
        x <= Math.floor(capsule.bounds.right / cellSize);
        x++
      ) {
        for (
          let z = Math.floor(capsule.bounds.top / cellSize);
          z <= Math.floor(capsule.bounds.bottom / cellSize);
          z++
        ) {
          const key = `${x}:${z}`;
          const entries = cells.get(key) ?? [];
          entries.push(index);
          cells.set(key, entries);
        }
      }
    }
    const examined = new Set<number>();
    for (const entries of cells.values()) {
      for (const [index, aIndex] of entries.entries()) {
        const a = visibleCapsules[aIndex];
        for (const bIndex of entries.slice(index + 1)) {
          const pair = aIndex * visibleCapsules.length + bIndex;
          if (examined.has(pair)) continue;
          examined.add(pair);
          const b = visibleCapsules[bIndex];
          if (a.route.edge.id === b.route.edge.id || boundsGap(a.bounds, b.bounds) > EPSILON)
            continue;
          const intersection = polygonIntersection(a.footprint, b.footprint);
          if (intersection.length < 3) continue;
          const withinMarker = cities.some(
            (city) =>
              [a.route.edge.a, a.route.edge.b].includes(city.id) &&
              [b.route.edge.a, b.route.edge.b].includes(city.id) &&
              intersection.every(
                (point) => Math.hypot(point.x - city.x, point.z - city.z) <= CITY_RIM + EPSILON,
              ),
          );
          if (!withinMarker)
            conflicts.push({
              a: a.id,
              b: b.id,
              clearance: polygonClearance(a.footprint, b.footprint),
            });
        }
      }
    }
    assertClear(conflicts);
  });

  it('does not intersect visible route ink and any widest marked name leader', () => {
    const conflicts: Conflict[] = [];
    const leaders = labels.flatMap((label) =>
      (label.leader ?? []).slice(1).map((b, index) => {
        const a = label.leader![index];
        const footprint = strokeCapsule(a, b, LEADER_RADIUS);
        return { label, index, footprint, bounds: boundsOf(footprint) };
      }),
    );
    for (const ink of visibleCapsules) {
      for (const leader of leaders) {
        if (boundsGap(ink.bounds, leader.bounds) > EPSILON) continue;
        const intersection = polygonIntersection(ink.footprint, leader.footprint);
        if (intersection.length < 3) continue;
        const start = leader.label.leader![0];
        const ownInitialCap =
          leader.index === 0 &&
          [ink.route.edge.a, ink.route.edge.b].includes(leader.label.city.id) &&
          intersection.every(
            (point) =>
              Math.hypot(point.x - start.x, point.z - start.z) <=
              LEADER_RADIUS / Math.cos(Math.PI / 32) + EPSILON,
          );
        if (!ownInitialCap)
          conflicts.push({
            a: ink.id,
            b: `${leader.label.city.id} leader[${leader.index}]`,
            clearance: polygonClearance(ink.footprint, leader.footprint),
          });
      }
    }
    assertClear(conflicts);
  });

  it('does not intersect Paris incident ink outside shared city marker rims', () => {
    const conflicts: Conflict[] = [];
    const incident = routeSegments
      .filter(({ route }) => [route.edge.a, route.edge.b].includes('paris'))
      .map(({ route, segments }) => ({
        route,
        segments: segments.map((segment) => {
          const footprint = strokeCapsule(segment.a, segment.b);
          return { ...segment, footprint, bounds: boundsOf(footprint) };
        }),
      }));
    for (const [index, first] of incident.entries()) {
      for (const second of incident.slice(index + 1)) {
        const commonCities = cities.filter(
          (city) =>
            [first.route.edge.a, first.route.edge.b].includes(city.id) &&
            [second.route.edge.a, second.route.edge.b].includes(city.id),
        );
        for (const a of first.segments) {
          for (const b of second.segments) {
            if (boundsGap(a.bounds, b.bounds) > EPSILON) continue;
            const intersection = polygonIntersection(a.footprint, b.footprint);
            if (intersection.length < 3) continue;
            const withinMarker = commonCities.some((city) =>
              intersection.every(
                (point) => Math.hypot(point.x - city.x, point.z - city.z) <= CITY_RIM + EPSILON,
              ),
            );
            if (!withinMarker)
              conflicts.push({
                a: a.id,
                b: b.id,
                clearance: polygonClearance(a.footprint, b.footprint),
              });
          }
        }
      }
    }
    assertClear(conflicts);
  });

  it('preserves the selected variant geographic displacement limit and southeast ordering', () => {
    for (const city of cities) {
      const geographic = EUROPE_CITY_POSITIONS[city.id];
      expect(
        Math.hypot(city.x - geographic.x, city.z - geographic.z),
        `${city.id} displacement from geographic projection`,
      ).toBeLessThanOrEqual(0.95 + EPSILON);
    }
    const sofia = cities.find((city) => city.id === 'sofia')!;
    const bucuresti = cities.find((city) => city.id === 'bucuresti')!;
    expect(sofia.x).toBeLessThan(bucuresti.x);
    expect(sofia.z).toBeGreaterThan(bucuresti.z);
  });

  it('extracts the whole coach, including couplers beyond the nominal carriage ends', () => {
    const fixture = physicalBoard(
      [
        {
          ...routes[0],
          coachLength: 0.62,
          width: 0.2852,
          slots: [{ position: { x: 0, z: 0 }, angle: 0 }],
        },
      ],
      [],
    );
    const coach = fixture.slots[0].occupied;
    expect(Math.max(...coach.vertices.map((point) => point.z))).toBeGreaterThan(0.31);
    expect(Math.min(...coach.vertices.map((point) => point.z))).toBeLessThan(-0.31);
    expect(coach.footprint.length).toBeGreaterThan(4);
  });

  it.each([
    ['empty', 'empty'],
    ['occupied', 'occupied'],
    ['empty', 'occupied'],
    ['occupied', 'empty'],
  ] as const)('separates every unordered pair of 299 seats in %s/%s states', (one, two) => {
    const conflicts: Conflict[] = [];
    for (let a = 0; a < board.slots.length; a += 1) {
      for (let b = a + 1; b < board.slots.length; b += 1) {
        const first = board.slots[a][one];
        const second = board.slots[b][two];
        collectConflict(conflicts, first.id, second.id, first.footprint, second.footprint);
      }
    }
    assertClear(conflicts);
  });

  it.each([
    ['dieppe--paris-1', 'bruxelles--dieppe-1'],
    ['essen--kobenhavn-1', 'berlin--essen-1'],
    ['frankfurt--paris-1', 'bruxelles--frankfurt-1'],
    ['palermo--smyrna-1', 'athina--sarajevo-1'],
    ['petrograd--riga-1', 'petrograd--stockholm-1'],
  ])('regresses the observed overlapping routes %s / %s', (a, b) => {
    const conflicts: Conflict[] = [];
    for (const one of board.slots.filter((slot) => slot.edgeId === a)) {
      for (const two of board.slots.filter((slot) => slot.edgeId === b)) {
        for (const first of [one.empty, one.occupied]) {
          for (const second of [two.empty, two.occupied]) {
            collectConflict(conflicts, first.id, second.id, first.footprint, second.footprint);
          }
        }
      }
    }
    assertClear(conflicts);
  });

  it.each(['pin', 'station'] as const)(
    'leaves all 47 full %s footprints clear of every free or owned seat',
    (kind) => {
      const conflicts: Conflict[] = [];
      for (const city of board.cities) {
        for (const carriage of carriages) {
          collectConflict(
            conflicts,
            city[kind].id,
            carriage.id,
            city[kind].footprint,
            carriage.footprint,
          );
        }
      }
      assertClear(conflicts);
    },
  );

  it('keeps every full name plate clear of carriages, pins, stations and other plates', () => {
    const conflicts: Conflict[] = [];
    for (const [index, label] of labelShapes.entries()) {
      for (const carriage of carriages)
        collectConflict(conflicts, label.id, carriage.id, label.footprint, carriage.footprint);
      for (const city of board.cities) {
        for (const kind of ['pin', 'station'] as const)
          collectConflict(
            conflicts,
            label.id,
            city[kind].id,
            label.footprint,
            city[kind].footprint,
          );
      }
      for (const other of labelShapes.slice(index + 1))
        collectConflict(conflicts, label.id, other.id, label.footprint, other.footprint);
    }
    assertClear(conflicts);
  });

  it('associates all 47 name centers and plate edges with their own nearest marker', () => {
    const conflicts: Conflict[] = [];
    for (const label of labelShapes) {
      const ownCenter = Math.hypot(
        label.label.x - label.label.city.x,
        label.label.z - label.label.city.z,
      );
      const ownEdge = pointPolygonGap(label.label.city, label.footprint);
      for (const other of cities) {
        if (other.id === label.label.city.id) continue;
        const center = Math.hypot(label.label.x - other.x, label.label.z - other.z);
        const edge = pointPolygonGap(other, label.footprint);
        if (center < ownCenter + GAP - EPSILON)
          conflicts.push({ a: label.id, b: `${other.id} center`, clearance: center - ownCenter });
        if (edge < ownEdge + GAP - EPSILON)
          conflicts.push({ a: label.id, b: `${other.id} plate edge`, clearance: edge - ownEdge });
      }
    }
    assertClear(conflicts);
  });

  it('provides exact leader geometry, clipped to its marker rim and name-plate boundary', () => {
    for (const label of labelShapes) {
      const points = label.label.leader;
      expect(points?.length ?? 0, `${label.id} printed leader`).toBeGreaterThanOrEqual(2);
      if (!points || points.length < 2) continue;
      const first = points[0];
      const last = points[points.length - 1];
      expect(
        Math.hypot(first.x - label.label.city.x, first.z - label.label.city.z),
        `${label.id} marker rim`,
      ).toBeCloseTo(0.16, 5);
      expect(pointPolygonGap(last, label.footprint), `${label.id} plate boundary`).toBeLessThan(
        EPSILON,
      );
      const boundaryGap = Math.min(
        Math.abs(Math.abs(last.x - label.label.x) - label.label.width / 2),
        Math.abs(Math.abs(last.z - label.label.z) - label.label.height / 2),
      );
      expect(boundaryGap, `${label.id} plate boundary`).toBeLessThan(EPSILON);
      for (const point of points)
        expect(Number.isFinite(point.x) && Number.isFinite(point.z), label.id).toBe(true);
    }
  });

  it('keeps the widest printed leaders clear of foreign stations, pins, labels and every carriage', () => {
    const conflicts: Conflict[] = [];
    for (const label of labelShapes) {
      const leader = label.label.leader ?? [];
      const obstacles: { id: string; footprint: MapPoint[] }[] = [
        ...carriages,
        ...board.cities
          .filter(({ city }) => city.id !== label.label.city.id)
          .flatMap((city) => [city.pin, city.station]),
        ...labelShapes.filter((other) => other.label.city.id !== label.label.city.id),
      ];
      for (let index = 1; index < leader.length; index += 1) {
        for (const obstacle of obstacles) {
          const clearance =
            segmentPolygonGap(leader[index - 1], leader[index], obstacle.footprint) - LEADER_RADIUS;
          if (clearance < GAP - EPSILON)
            conflicts.push({ a: `${label.id} leader[${index - 1}]`, b: obstacle.id, clearance });
        }
      }
    }
    assertClear(conflicts);
  });

  it.each([
    ['board', 1280, 720],
    ['board', 1920, 1080],
    ['overview', 1280, 720],
    ['overview', 1920, 1080],
  ] as const)('keeps projected name plates visible in %s at %i×%i', (mode, width, height) => {
    const conflicts: Conflict[] = [];
    const project = (object: PhysicalShape) => ({
      id: object.id,
      footprint: projectedFootprint(object.vertices, mode, width, height),
    });
    const obstacles = [
      ...carriages.map(project),
      ...board.cities.flatMap((city) => [project(city.pin), project(city.station)]),
    ];
    const plates = labelShapes.map((label) => ({
      id: label.id,
      footprint: projectedFootprint(printedVertices(label.footprint), mode, width, height),
    }));
    for (const [index, label] of plates.entries()) {
      for (const other of [...obstacles, ...plates.slice(index + 1)])
        collectConflict(conflicts, label.id, other.id, label.footprint, other.footprint, 0);
    }
    assertClear(conflicts);
  });

  it.each([
    [1280, 720],
    [1920, 1080],
  ] as const)(
    'keeps all full stations clear of projected free and owned seats at %i×%i',
    (width, height) => {
      const conflicts: Conflict[] = [];
      const stations = board.cities.map(({ station }) => ({
        id: station.id,
        footprint: projectedFootprint(station.vertices, 'board', width, height),
      }));
      for (const carriage of carriages) {
        const footprint = projectedFootprint(carriage.vertices, 'board', width, height);
        for (const station of stations)
          collectConflict(conflicts, carriage.id, station.id, footprint, station.footprint, 0);
      }
      assertClear(conflicts);
    },
  );
});
