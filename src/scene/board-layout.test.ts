import { describe, expect, it } from 'vitest';
import { CITIES, EDGES } from '../data/europe';
import { EUROPE_CITY_POSITIONS } from '../data/europe-geography';
import {
  cityLabels,
  presentationCities,
  routeLayouts,
  type MapPoint,
  type RouteLayout,
} from './board-layout';
import { TABLE_LAYOUT } from './table-layout';

type Rectangle = { x: number; z: number; width: number; depth: number };

function corners(rectangle: Rectangle, angle = 0): MapPoint[] {
  const across = { x: Math.cos(angle), z: -Math.sin(angle) };
  const along = { x: Math.sin(angle), z: Math.cos(angle) };
  return [-1, 1].flatMap((side) =>
    [-1, 1].map((end) => ({
      x:
        rectangle.x +
        (across.x * side * rectangle.width) / 2 +
        (along.x * end * rectangle.depth) / 2,
      z:
        rectangle.z +
        (across.z * side * rectangle.width) / 2 +
        (along.z * end * rectangle.depth) / 2,
    })),
  );
}

function overlap(a: MapPoint[], b: MapPoint[]) {
  const axes = [a, b].flatMap((rectangle) =>
    [rectangle[1], rectangle[2]].map((point) => ({
      x: point.x - rectangle[0].x,
      z: point.z - rectangle[0].z,
    })),
  );
  return axes.every((axis) => {
    const project = (points: MapPoint[]) =>
      points.map((point) => point.x * axis.x + point.z * axis.z);
    const pa = project(a),
      pb = project(b);
    return Math.min(...pa) < Math.max(...pb) - 1e-8 && Math.min(...pb) < Math.max(...pa) - 1e-8;
  });
}

function coachFootprints(route: RouteLayout) {
  return route.slots.map((slot) =>
    corners(
      {
        ...slot.position,
        width: route.width,
        depth: route.coachLength,
      },
      slot.angle,
    ),
  );
}

function assertWithin(points: MapPoint[], width: number, depth: number, label: string) {
  for (const point of points) {
    expect(Number.isFinite(point.x) && Number.isFinite(point.z), label).toBe(true);
    expect(Math.abs(point.x), `${label} horizontal extent`).toBeLessThanOrEqual(width / 2);
    expect(Math.abs(point.z), `${label} vertical extent`).toBeLessThanOrEqual(depth / 2);
  }
}

describe('geographic Europe board and table layout', () => {
  const cities = presentationCities(CITIES);
  const routes = routeLayouts(EDGES, cities);

  it('covers all 47 cities, preserves saved coordinates and keeps geographic ordering', () => {
    const sourceBefore = structuredClone(CITIES);
    const projected = presentationCities(CITIES);
    expect(Object.keys(EUROPE_CITY_POSITIONS).sort()).toEqual(CITIES.map((city) => city.id).sort());
    expect(projected).toHaveLength(47);
    expect(CITIES).toEqual(sourceBefore);
    for (const city of projected) {
      expect(city).not.toBe(CITIES.find((source) => source.id === city.id));
      assertWithin([city], TABLE_LAYOUT.board.width - 1, TABLE_LAYOUT.board.depth - 1, city.id);
    }
    const lookup = new Map(projected.map((city) => [city.id, city]));
    for (const [west, east] of [
      ['lisboa', 'madrid'],
      ['brest', 'paris'],
      ['london', 'berlin'],
      ['wien', 'budapest'],
    ]) {
      expect(lookup.get(west)!.x).toBeLessThan(lookup.get(east)!.x);
    }
    for (const [north, south] of [
      ['stockholm', 'kobenhavn'],
      ['venezia', 'roma'],
      ['edinburgh', 'london'],
    ]) {
      expect(lookup.get(north)!.z).toBeLessThan(lookup.get(south)!.z);
    }
  });

  it('provides exactly 299 physical carriage slots for the 101 unchanged routes', () => {
    expect(routes).toHaveLength(101);
    expect(new Set(routes.map((route) => route.edge.id)).size).toBe(101);
    expect(routes.reduce((sum, route) => sum + route.slots.length, 0)).toBe(299);
    for (const route of routes) {
      expect(route.slots, route.edge.id).toHaveLength(route.edge.length);
      expect(route.coachLength).toBeGreaterThan(0);
      expect(route.width).toBeGreaterThan(0);
      expect(route.edge).toEqual(EDGES.find((edge) => edge.id === route.edge.id));
      assertWithin(route.points, TABLE_LAYOUT.board.width, TABLE_LAYOUT.board.depth, route.edge.id);
      for (const slot of route.slots) expect(Number.isFinite(slot.angle), route.edge.id).toBe(true);
      const footprints = coachFootprints(route);
      footprints.forEach((points) =>
        assertWithin(points, TABLE_LAYOUT.board.width, TABLE_LAYOUT.board.depth, route.edge.id),
      );
      for (let a = 0; a < footprints.length; a += 1) {
        for (let b = a + 1; b < footprints.length; b += 1) {
          expect(overlap(footprints[a], footprints[b]), `${route.edge.id} coaches ${a}/${b}`).toBe(
            false,
          );
        }
      }
    }
  });

  it('keeps all eleven double routes physically separated when both are occupied', () => {
    const doubles = new Map<string, RouteLayout[]>();
    for (const route of routes) {
      if (!route.edge.parallel) continue;
      doubles.set(route.edge.parallel, [...(doubles.get(route.edge.parallel) ?? []), route]);
    }
    expect(doubles.size).toBe(11);
    for (const [id, pair] of doubles) {
      expect(pair, id).toHaveLength(2);
      for (const a of coachFootprints(pair[0])) {
        for (const b of coachFootprints(pair[1])) {
          expect(overlap(a, b), `${id} occupied double line`).toBe(false);
        }
      }
    }
  });

  it('keeps all 47 city names clear of other names, pins and occupied carriage footprints', () => {
    const labels = cityLabels(cities, routes);
    expect(labels).toHaveLength(47);
    expect(labels.map((label) => label.city.id).sort()).toEqual(
      CITIES.map((city) => city.id).sort(),
    );
    const coachShapes = routes.flatMap(coachFootprints);
    for (let index = 0; index < labels.length; index += 1) {
      const label = labels[index];
      const points = corners({ ...label, depth: label.height });
      assertWithin(points, TABLE_LAYOUT.board.width, TABLE_LAYOUT.board.depth, label.city.id);
      for (const coach of coachShapes) {
        expect(overlap(points, coach), `${label.city.id} text hidden by carriage`).toBe(false);
      }
      for (const city of cities) {
        const dx = Math.max(0, Math.abs(city.x - label.x) - label.width / 2);
        const dz = Math.max(0, Math.abs(city.z - label.z) - label.height / 2);
        expect(
          Math.hypot(dx, dz),
          `${label.city.id} text hidden by ${city.id} pin`,
        ).toBeGreaterThanOrEqual(0.16);
      }
      for (const other of labels.slice(index + 1)) {
        expect(
          overlap(points, corners({ ...other, depth: other.height })),
          `${label.city.id}/${other.city.id} text overlap`,
        ).toBe(false);
      }
    }
  });

  const board = {
    x: 0,
    z: 0,
    width: TABLE_LAYOUT.board.width + 0.5,
    depth: TABLE_LAYOUT.board.depth + 0.5,
  };
  const paper = { ...TABLE_LAYOUT.paper, depth: TABLE_LAYOUT.paper.height };
  const score = {
    ...TABLE_LAYOUT.score,
    width: TABLE_LAYOUT.score.width + 0.3,
    depth: TABLE_LAYOUT.score.height,
  };

  it('leaves a clear physical gap between the map frame, card market and action paper', () => {
    expect(overlap(corners(board), corners(TABLE_LAYOUT.stock))).toBe(false);
    expect(overlap(corners(board), corners(paper))).toBe(false);
    expect(TABLE_LAYOUT.stock.x + TABLE_LAYOUT.stock.width / 2).toBeLessThan(-board.width / 2);
    expect(paper.x - paper.width / 2).toBeGreaterThan(board.width / 2);
  });

  it('keeps complete map, stock, paper and score footprints on the tabletop', () => {
    // An upright page's full height bounds its horizontal projection at any tilt.
    for (const [name, rectangle] of Object.entries({
      board,
      stock: TABLE_LAYOUT.stock,
      paper,
      score,
    })) {
      assertWithin(corners(rectangle), TABLE_LAYOUT.table.width, TABLE_LAYOUT.table.depth, name);
    }
  });
});
