import type { City, Edge } from '../shared/types';
import { EUROPE_CITY_POSITIONS } from '../data/europe-geography';

export type MapPoint = { x: number; z: number };
export type RouteLayout = {
  edge: Edge;
  points: MapPoint[];
  slots: { position: MapPoint; angle: number }[];
  coachLength: number;
  width: number;
};

export function presentationCities(cities: City[]): City[] {
  return cities.map((city) => ({ ...city, ...(EUROPE_CITY_POSITIONS[city.id] ?? {}) }));
}

function distance(a: MapPoint, b: MapPoint) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function curvePoints(a: MapPoint, b: MapPoint, bend: number): MapPoint[] {
  const span = distance(a, b),
    nx = -(b.z - a.z) / span,
    nz = (b.x - a.x) / span;
  const trim = Math.min(0.22, span * 0.16);
  const ax = a.x + ((b.x - a.x) * trim) / span;
  const az = a.z + ((b.z - a.z) * trim) / span;
  const bx = b.x - ((b.x - a.x) * trim) / span;
  const bz = b.z - ((b.z - a.z) * trim) / span;
  const cx = (a.x + b.x) / 2 + nx * bend;
  const cz = (a.z + b.z) / 2 + nz * bend;
  return Array.from({ length: 49 }, (_, i) => {
    const t = i / 48,
      u = 1 - t;
    return {
      x: u * u * ax + 2 * u * t * cx + t * t * bx,
      z: u * u * az + 2 * u * t * cz + t * t * bz,
    };
  });
}

function offsetCurve(points: MapPoint[], offset: number): MapPoint[] {
  return points.map((point, index) => {
    const before = points[Math.max(0, index - 1)]!;
    const after = points[Math.min(points.length - 1, index + 1)]!;
    const dx = after.x - before.x,
      dz = after.z - before.z;
    const span = Math.hypot(dx, dz);
    return { x: point.x - (dz * offset) / span, z: point.z + (dx * offset) / span };
  });
}

function curveLength(points: MapPoint[]) {
  return points.slice(1).reduce((sum, p, i) => sum + distance(points[i]!, p), 0);
}

function pointAtDistance(points: MapPoint[], at: number) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      span = distance(a, b);
    if (at <= span || i === points.length - 1) {
      const t = Math.max(0, Math.min(1, at / span));
      return {
        position: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t },
        angle: Math.atan2(b.x - a.x, b.z - a.z),
      };
    }
    at -= span;
  }
  return { position: points[0]!, angle: 0 };
}

export function routeLayouts(edges: Edge[], cities: City[]): RouteLayout[] {
  const lookup = new Map(cities.map((city) => [city.id, city]));
  const baseCurves = new Map<string, MapPoint[]>();
  const layouts = edges.map((edge) => {
    const siblings = edge.parallel
      ? edges.filter((other) => other.parallel === edge.parallel)
      : [edge];
    const offset =
      (siblings.findIndex((other) => other.id === edge.id) - (siblings.length - 1) / 2) * 0.34;
    const key = edge.parallel ?? `${edge.a}:${edge.b}`;
    let base = baseCurves.get(key);
    if (!base) {
      const a = lookup.get(siblings[0]!.a)!,
        b = lookup.get(siblings[0]!.b)!;
      const side = Array.from(key).reduce((n, c) => n + c.charCodeAt(0), 0) % 2 ? 1 : -1;
      let bend = Math.min(0.32, distance(a, b) * 0.09) * side;
      base = curvePoints(a, b, bend);
      const needed = Math.max(...siblings.map((sibling) => sibling.length)) * 0.53;
      while (curveLength(base) < needed && Math.abs(bend) < 1.05) {
        bend += side * 0.12;
        base = curvePoints(a, b, bend);
      }
      baseCurves.set(key, base);
    }
    const points = offsetCurve(base, offset);
    const length = curveLength(points),
      step = length / edge.length;
    const slots = Array.from({ length: edge.length }, (_, i) =>
      pointAtDistance(points, step * (i + 0.5)),
    );
    let closestSpacing = Infinity;
    for (let a = 0; a < slots.length; a += 1) {
      for (let b = a + 1; b < slots.length; b += 1) {
        closestSpacing = Math.min(closestSpacing, distance(slots[a]!.position, slots[b]!.position));
      }
    }
    const coachLength = Math.min(0.62, step * 0.77, closestSpacing * 0.82);
    return {
      edge,
      points,
      coachLength,
      width: coachLength * 0.46,
      slots,
    };
  });
  for (const route of layouts) {
    if (!route.edge.parallel) continue;
    const siblings = layouts.filter((other) => other.edge.parallel === route.edge.parallel);
    const sharedLength = Math.min(...siblings.map((other) => other.coachLength));
    siblings.forEach((other) => {
      other.coachLength = sharedLength;
      other.width = sharedLength * 0.46;
    });
  }
  return layouts;
}

export type CityLabel = { city: City; x: number; z: number; width: number; height: number };
function intersects(a: CityLabel, b: CityLabel) {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 0.07 &&
    Math.abs(a.z - b.z) < (a.height + b.height) / 2 + 0.06
  );
}

type CoachObstacle = {
  center: MapPoint;
  cos: number;
  sin: number;
  halfWidth: number;
  halfLength: number;
};

function coversCoach(rect: CityLabel, coach: CoachObstacle) {
  const dx = rect.x - coach.center.x,
    dz = rect.z - coach.center.z;
  const hw = rect.width / 2 + 0.04,
    hh = rect.height / 2 + 0.04;
  const cos = Math.abs(coach.cos),
    sin = Math.abs(coach.sin);
  if (Math.abs(dx) >= hw + cos * coach.halfWidth + sin * coach.halfLength) return false;
  if (Math.abs(dz) >= hh + sin * coach.halfWidth + cos * coach.halfLength) return false;
  return (
    Math.abs(dx * coach.cos - dz * coach.sin) < coach.halfWidth + hw * cos + hh * sin &&
    Math.abs(dx * coach.sin + dz * coach.cos) < coach.halfLength + hw * sin + hh * cos
  );
}

function coversPin(rect: CityLabel, pin: MapPoint) {
  const dx = Math.max(0, Math.abs(pin.x - rect.x) - rect.width / 2);
  const dz = Math.max(0, Math.abs(pin.z - rect.z) - rect.height / 2);
  return dx * dx + dz * dz < 0.23 * 0.23;
}

function segmentCrossesLabel(a: MapPoint, b: MapPoint, rect: CityLabel, padding: number) {
  let low = 0,
    high = 1;
  for (const [start, delta, center, extent] of [
    [a.x, b.x - a.x, rect.x, rect.width / 2 + padding],
    [a.z, b.z - a.z, rect.z, rect.height / 2 + padding],
  ]) {
    if (Math.abs(delta) < 1e-10) {
      if (Math.abs(start - center) > extent) return false;
      continue;
    }
    const one = (center - extent - start) / delta,
      two = (center + extent - start) / delta;
    low = Math.max(low, Math.min(one, two));
    high = Math.min(high, Math.max(one, two));
    if (low > high) return false;
  }
  return true;
}

type LabelCandidate = { rect: CityLabel; fixedCost: number };
let cachedLabels: {
  key: string;
  placements: { id: string; x: number; z: number; width: number; height: number }[];
} | null = null;

export function cityLabels(cities: City[], routes: RouteLayout[]): CityLabel[] {
  const key =
    cities.map((c) => `${c.id}:${c.name}:${c.x}:${c.z}`).join('|') +
    routes.map((r) => `${r.edge.id}:${r.edge.length}:${r.coachLength}:${r.width}`).join('|');
  if (cachedLabels?.key === key) {
    const lookup = new Map(cities.map((city) => [city.id, city]));
    return cachedLabels.placements.map(({ id, ...rect }) => ({ ...rect, city: lookup.get(id)! }));
  }
  const coaches: CoachObstacle[] = routes.flatMap((route) =>
    route.slots.map((slot) => ({
      center: slot.position,
      cos: Math.cos(slot.angle),
      sin: Math.sin(slot.angle),
      halfWidth: route.width / 2,
      halfLength: route.coachLength / 2,
    })),
  );
  const routeBounds = routes.map((route) => ({
    route,
    left: Math.min(...route.points.map((p) => p.x)) - route.width / 2 - 0.04,
    right: Math.max(...route.points.map((p) => p.x)) + route.width / 2 + 0.04,
    top: Math.min(...route.points.map((p) => p.z)) - route.width / 2 - 0.04,
    bottom: Math.max(...route.points.map((p) => p.z)) + route.width / 2 + 0.04,
  }));
  const fixedScore = (rect: CityLabel) => {
    let cost = distance(rect.city, rect) * 3;
    if (Math.abs(rect.x) + rect.width / 2 > 11.75 || Math.abs(rect.z) + rect.height / 2 > 7.75)
      return Infinity;
    for (const city of cities) if (coversPin(rect, city)) cost += 20000;
    for (const coach of coaches) if (coversCoach(rect, coach)) cost += 12000;
    for (const bounds of routeBounds) {
      if (
        rect.x + rect.width / 2 < bounds.left ||
        rect.x - rect.width / 2 > bounds.right ||
        rect.z + rect.height / 2 < bounds.top ||
        rect.z - rect.height / 2 > bounds.bottom
      )
        continue;
      const route = bounds.route;
      if (
        route.points.some(
          (point, i) =>
            i > 0 && segmentCrossesLabel(route.points[i - 1]!, point, rect, route.width / 2 + 0.04),
        )
      )
        cost += 6000;
    }
    return cost;
  };
  const candidates = new Map<string, LabelCandidate[]>();
  for (const city of cities) {
    const width = Math.min(2.2, 0.25 + city.name.length * 0.118),
      height = 0.38;
    const options: LabelCandidate[] = [];
    for (const gap of [0.3, 0.4, 0.48, 0.58, 0.67, 0.85, 1.05, 1.3, 1.6, 2.0, 2.4]) {
      const side = width / 2 + gap;
      for (const [dx, dz] of [
        [0, -gap],
        [0, gap],
        [-side, 0],
        [side, 0],
        [-side, -gap],
        [side, -gap],
        [-side, gap],
        [side, gap],
        [-width * 0.3, -gap],
        [width * 0.3, -gap],
        [-width * 0.3, gap],
        [width * 0.3, gap],
        [-width * 0.6, -gap],
        [width * 0.6, -gap],
        [-width * 0.6, gap],
        [width * 0.6, gap],
        [-side, -gap * 0.5],
        [side, -gap * 0.5],
        [-side, gap * 0.5],
        [side, gap * 0.5],
      ]) {
        const rect = { city, x: city.x + dx!, z: city.z + dz!, width, height };
        options.push({ rect, fixedCost: fixedScore(rect) });
      }
    }
    candidates.set(city.id, options);
  }
  const placed: CityLabel[] = [];
  const score = (candidate: LabelCandidate, otherLabels: CityLabel[]) =>
    candidate.fixedCost +
    otherLabels.filter(
      (label) => label.city.id !== candidate.rect.city.id && intersects(candidate.rect, label),
    ).length *
      50000;
  const best = (city: City, otherLabels: CityLabel[]) =>
    candidates
      .get(city.id)!
      .reduce((current, candidate) =>
        score(candidate, otherLabels) < score(current, otherLabels) ? candidate : current,
      );
  const ordered = [...cities].sort(
    (a, b) =>
      routes.filter((route) => route.edge.a === b.id || route.edge.b === b.id).length -
      routes.filter((route) => route.edge.a === a.id || route.edge.b === a.id).length,
  );
  for (const city of ordered) placed.push(best(city, placed).rect);
  for (let pass = 0; pass < 2; pass += 1) {
    const order = [...placed].sort((a, b) => fixedScore(b) - fixedScore(a));
    for (const label of order) {
      const index = placed.findIndex((current) => current.city.id === label.city.id);
      placed[index] = best(label.city, placed).rect;
    }
  }
  cachedLabels = { key, placements: placed.map(({ city, ...rect }) => ({ ...rect, id: city.id })) };
  return placed;
}
