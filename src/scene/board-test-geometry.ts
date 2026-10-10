import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { City } from '../shared/types';
import type { MapPoint, RouteLayout } from './board-layout';
import { createRailMiniatures } from './rail-miniatures';
import { TABLE_CAMERA } from './table-layout';

export type PhysicalShape = {
  id: string;
  vertices: THREE.Vector3[];
  footprint: MapPoint[];
};
export type PhysicalSlot = {
  edgeId: string;
  index: number;
  empty: PhysicalShape;
  occupied: PhysicalShape;
};
export type PhysicalCity = { city: City; pin: PhysicalShape; station: PhysicalShape };
type Templates = {
  coaches: THREE.Vector3[];
  slots: Map<string, THREE.Vector3[]>;
  pin: THREE.Vector3[];
  station: THREE.Vector3[];
};

const EPSILON = 1e-8;
const trackKey = (tunnel: boolean, ferry: boolean) => `${tunnel}:${ferry}`;
const cross = (a: MapPoint, b: MapPoint, c: MapPoint) =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

/** Test oracle: extract the actual meshes without importing the placement solver. */
function verticesOf(root: THREE.Object3D): THREE.Vector3[] {
  root.updateWorldMatrix(true, true);
  const vertices = new Map<string, THREE.Vector3>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      const point = new THREE.Vector3()
        .fromBufferAttribute(positions, index)
        .applyMatrix4(object.matrixWorld);
      vertices.set(
        point
          .toArray()
          .map((value) => value.toFixed(8))
          .join(':'),
        point,
      );
    }
  });
  if (vertices.size === 0) throw new Error('Physical test template contains no mesh vertices');
  return [...vertices.values()];
}

function disposeTemplates(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function physicalTemplates(): Templates {
  const root = new THREE.Group();
  const factory = createRailMiniatures();
  const coaches = verticesOf(factory.addCoach(root, '#608eaf', 0.62, 0.2232));
  const slots = new Map<string, THREE.Vector3[]>();
  for (const tunnel of [false, true]) {
    for (const ferry of [false, true]) {
      slots.set(
        trackKey(tunnel, ferry),
        verticesOf(factory.addTrackSlot(root, '#b57da5', 0.62, 0.2852, tunnel, ferry)),
      );
    }
  }
  const pin = new THREE.Group();
  for (const [radius, height, y] of [
    [0.16, 0.035, -0.744],
    [0.1, 0.038, -0.717],
  ]) {
    const part = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10));
    part.scale.set(radius, height, radius);
    part.position.y = y;
    pin.add(part);
  }
  root.add(pin);
  const station = new THREE.Group();
  station.position.y = -0.71;
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.25, 0.3, 2, 0.025));
  body.position.y = 0.17;
  station.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4));
  roof.scale.set(0.32, 0.2, 0.25);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.39;
  station.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.135, 0.015));
  door.position.set(0, 0.125, 0.155);
  station.add(door);
  root.add(station);
  const result = { coaches, slots, pin: verticesOf(pin), station: verticesOf(station) };
  disposeTemplates(root);
  return result;
}

/** A conservative convex hull retains roofs, buffers and narrow couplers. */
export function convexHull(points: MapPoint[]): MapPoint[] {
  const sorted = [
    ...new Map(points.map((point) => [`${point.x}:${point.z}`, point])).values(),
  ].sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.z)))
    throw new Error('Non-finite physical footprint');
  const lower: MapPoint[] = [];
  const upper: MapPoint[] = [];
  for (const point of sorted) {
    while (
      lower.length > 1 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= EPSILON
    )
      lower.pop();
    lower.push(point);
  }
  for (const point of [...sorted].reverse()) {
    while (
      upper.length > 1 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= EPSILON
    )
      upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function rectangle(center: MapPoint, width: number, depth: number): MapPoint[] {
  return [
    { x: center.x - width / 2, z: center.z - depth / 2 },
    { x: center.x + width / 2, z: center.z - depth / 2 },
    { x: center.x + width / 2, z: center.z + depth / 2 },
    { x: center.x - width / 2, z: center.z + depth / 2 },
  ];
}

function transformed(
  vertices: THREE.Vector3[],
  center: MapPoint,
  angle: number,
  scale = 1,
  y = 0,
): THREE.Vector3[] {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(center.x, y, center.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
    new THREE.Vector3(scale, scale, scale),
  );
  return vertices.map((point) => point.clone().applyMatrix4(matrix));
}

function shape(id: string, vertices: THREE.Vector3[]): PhysicalShape {
  return { id, vertices, footprint: convexHull(vertices.map(({ x, z }) => ({ x, z }))) };
}

export function physicalBoard(routes: RouteLayout[], cities: City[]) {
  const templates = physicalTemplates();
  const slots: PhysicalSlot[] = routes.flatMap((route) =>
    route.slots.map((slot, index) => {
      const scale = route.coachLength / 0.62;
      const id = `${route.edge.id}[${index}]`;
      return {
        edgeId: route.edge.id,
        index,
        empty: shape(
          `${id} empty`,
          transformed(
            templates.slots.get(trackKey(route.edge.tunnel, index < route.edge.ferries))!,
            slot.position,
            slot.angle,
            scale,
            -0.77,
          ),
        ),
        occupied: shape(
          `${id} occupied`,
          transformed(templates.coaches, slot.position, slot.angle, scale, -0.745),
        ),
      };
    }),
  );
  const cityShapes: PhysicalCity[] = cities.map((city) => ({
    city,
    pin: shape(`${city.id} pin`, transformed(templates.pin, city, 0)),
    station: shape(`${city.id} station`, transformed(templates.station, city, 0)),
  }));
  return { slots, cities: cityShapes };
}

function pointSegmentGap(point: MapPoint, a: MapPoint, b: MapPoint) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const denominator = dx * dx + dz * dz;
  const t = denominator
    ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / denominator))
    : 0;
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
}

function containsPoint(point: MapPoint, polygon: MapPoint[]) {
  return polygon.every(
    (a, index) => cross(a, polygon[(index + 1) % polygon.length], point) >= -EPSILON,
  );
}

export function pointPolygonGap(point: MapPoint, polygon: MapPoint[]): number {
  if (containsPoint(point, polygon)) return 0;
  return Math.min(
    ...polygon.map((a, index) => pointSegmentGap(point, a, polygon[(index + 1) % polygon.length])),
  );
}

function segmentIntersects(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (abC * abD < -EPSILON && cdA * cdB < -EPSILON) return true;
  return (
    pointSegmentGap(a, c, d) < EPSILON ||
    pointSegmentGap(b, c, d) < EPSILON ||
    pointSegmentGap(c, a, b) < EPSILON ||
    pointSegmentGap(d, a, b) < EPSILON
  );
}

export function segmentPolygonGap(a: MapPoint, b: MapPoint, polygon: MapPoint[]): number {
  if (containsPoint(a, polygon) || containsPoint(b, polygon)) return 0;
  let gap = Infinity;
  polygon.forEach((c, index) => {
    const d = polygon[(index + 1) % polygon.length];
    if (segmentIntersects(a, b, c, d)) gap = 0;
    gap = Math.min(
      gap,
      pointSegmentGap(a, c, d),
      pointSegmentGap(b, c, d),
      pointSegmentGap(c, a, b),
      pointSegmentGap(d, a, b),
    );
  });
  return gap;
}

/** Conservative signed clearance; near shapes use SAT and exact Euclidean edge gaps. */
export function polygonClearance(a: MapPoint[], b: MapPoint[]): number {
  const bounds = (polygon: MapPoint[]) => ({
    left: Math.min(...polygon.map((point) => point.x)),
    right: Math.max(...polygon.map((point) => point.x)),
    top: Math.min(...polygon.map((point) => point.z)),
    bottom: Math.max(...polygon.map((point) => point.z)),
  });
  const oneBounds = bounds(a);
  const twoBounds = bounds(b);
  const broadGap = Math.hypot(
    Math.max(0, oneBounds.left - twoBounds.right, twoBounds.left - oneBounds.right),
    Math.max(0, oneBounds.top - twoBounds.bottom, twoBounds.top - oneBounds.bottom),
  );
  if (broadGap > 0.03) return broadGap;
  let penetration = Infinity;
  let separated = false;
  for (const polygon of [a, b]) {
    polygon.forEach((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      const span = Math.hypot(next.x - point.x, next.z - point.z);
      const axis = { x: -(next.z - point.z) / span, z: (next.x - point.x) / span };
      const projection = (points: MapPoint[]) => points.map((p) => p.x * axis.x + p.z * axis.z);
      const one = projection(a);
      const two = projection(b);
      const amount =
        Math.min(Math.max(...one), Math.max(...two)) - Math.max(Math.min(...one), Math.min(...two));
      if (amount < -EPSILON) separated = true;
      penetration = Math.min(penetration, amount);
    });
  }
  if (!separated) return -Math.max(0, penetration);
  return Math.min(
    ...a.map((point) => pointPolygonGap(point, b)),
    ...b.map((point) => pointPolygonGap(point, a)),
  );
}

export function projectedFootprint(
  vertices: THREE.Vector3[],
  mode: 'board' | 'overview',
  width: number,
  height: number,
): MapPoint[] {
  const camera = new THREE.PerspectiveCamera(43, width / height, 0.1, 180);
  camera.position.fromArray(TABLE_CAMERA[mode].position);
  camera.lookAt(new THREE.Vector3(...TABLE_CAMERA[mode].target));
  camera.updateMatrixWorld(true);
  return convexHull(
    vertices.map((vertex) => {
      const point = vertex.clone().project(camera);
      return { x: ((point.x + 1) * width) / 2, z: ((1 - point.y) * height) / 2 };
    }),
  );
}

export function printedVertices(polygon: MapPoint[]): THREE.Vector3[] {
  return polygon.map(({ x, z }) => new THREE.Vector3(x, -0.796, z));
}
