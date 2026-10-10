import type { City, Edge } from '../shared/types';
import {
  EUROPE_BOARD_CITIES,
  EUROPE_BOARD_LABELS,
  EUROPE_BOARD_ROUTES,
  type SavedRoute,
} from './board-europe-layout';
import {
  presentationCities as fallbackCities,
  routeLayouts as fallbackRoutes,
  cityLabels as fallbackLabels,
} from './board-layout-fallback';

export type MapPoint = { x: number; z: number };
export type RouteLayout = {
  edge: Edge;
  points: MapPoint[];
  inkPaths?: MapPoint[][];
  slots: { position: MapPoint; angle: number }[];
  coachLength: number;
  width: number;
};
export type CityLabel = {
  city: City;
  x: number;
  z: number;
  width: number;
  height: number;
  leader?: MapPoint[];
};

const point = ([x, z]: [number, number]): MapPoint => ({ x, z });
const samePoint = (a: MapPoint, b: MapPoint) =>
  Math.abs(a.x - b.x) < 1e-8 && Math.abs(a.z - b.z) < 1e-8;
const placedCity = (city: City) => {
  const saved = EUROPE_BOARD_CITIES[city.id];
  return saved && samePoint(city, saved);
};

export function presentationCities(cities: City[]): City[] {
  return fallbackCities(cities).map((city) => {
    const saved = EUROPE_BOARD_CITIES[city.id];
    return saved ? { ...city, x: saved.x, z: saved.z } : city;
  });
}

function savedRouteFits(edge: Edge, saved: SavedRoute, cities: Map<string, City>) {
  return (
    edge.a === saved.a &&
    edge.b === saved.b &&
    edge.length === saved.length &&
    !!cities.get(edge.a) &&
    !!cities.get(edge.b) &&
    placedCity(cities.get(edge.a)!) &&
    placedCity(cities.get(edge.b)!)
  );
}

export function routeLayouts(edges: Edge[], cities: City[]): RouteLayout[] {
  const lookup = new Map(cities.map((city) => [city.id, city]));
  let fallback: RouteLayout[] | undefined;
  return edges.map((edge) => {
    const saved = EUROPE_BOARD_ROUTES[edge.id];
    if (saved && savedRouteFits(edge, saved, lookup)) {
      return {
        edge,
        coachLength: saved.coachLength,
        width: saved.width,
        points: saved.points.map(point),
        ...(saved.inkPaths ? { inkPaths: saved.inkPaths.map((path) => path.map(point)) } : {}),
        slots: saved.slots.map(([x, z, angle]) => ({ position: { x, z }, angle })),
      };
    }
    fallback ??= fallbackRoutes(
      [...edges].sort((a, b) => a.id.localeCompare(b.id)),
      cities,
    );
    return fallback.find((route) => route.edge.id === edge.id)!;
  });
}

function hasSavedGeometry(route: RouteLayout) {
  const saved = EUROPE_BOARD_ROUTES[route.edge.id];
  return (
    saved &&
    route.edge.a === saved.a &&
    route.edge.b === saved.b &&
    route.edge.length === saved.length &&
    route.coachLength === saved.coachLength &&
    route.width === saved.width &&
    (route.inkPaths === undefined
      ? saved.inkPaths === undefined
      : !!saved.inkPaths &&
        route.inkPaths.length === saved.inkPaths.length &&
        route.inkPaths.every(
          (path, i) =>
            path.length === saved.inkPaths![i]!.length &&
            path.every((p, j) => samePoint(p, point(saved.inkPaths![i]![j]!))),
        )) &&
    route.points.length === saved.points.length &&
    route.slots.length === saved.slots.length &&
    route.points.every((p, i) => samePoint(p, point(saved.points[i]!))) &&
    route.slots.every(
      (slot, i) =>
        samePoint(slot.position, point([saved.slots[i]![0], saved.slots[i]![1]])) &&
        Math.abs(slot.angle - saved.slots[i]![2]) < 1e-8,
    )
  );
}

function clippedLeader(label: CityLabel): MapPoint[] {
  const dx = label.x - label.city.x;
  const dz = label.z - label.city.z;
  const span = Math.hypot(dx, dz);
  if (span < 1e-8)
    return [
      { x: label.city.x + 0.16, z: label.city.z },
      { x: label.x, z: label.z },
    ];
  const clipped = Math.min(
    label.width / 2 / (Math.abs(dx) || 1e-8),
    label.height / 2 / (Math.abs(dz) || 1e-8),
  );
  return [
    { x: label.city.x + (dx / span) * 0.16, z: label.city.z + (dz / span) * 0.16 },
    { x: label.x - dx * clipped, z: label.z - dz * clipped },
  ];
}

export function cityLabels(cities: City[], routes: RouteLayout[]): CityLabel[] {
  if (
    cities.every((city) => placedCity(city) && EUROPE_BOARD_CITIES[city.id]!.name === city.name) &&
    routes.every(hasSavedGeometry)
  ) {
    return cities.map((city) => {
      const saved = EUROPE_BOARD_LABELS[city.id]!;
      return {
        city,
        x: saved.x,
        z: saved.z,
        width: saved.width,
        height: saved.height,
        leader: saved.leader.map(point),
      };
    });
  }
  return fallbackLabels(cities, routes).map((label) => ({
    ...label,
    leader: clippedLeader(label),
  }));
}
