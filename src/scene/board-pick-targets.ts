import * as THREE from 'three';
import type { MapPoint, RouteLayout } from './board-layout';

/** The printed route stroke and its pick ribbon use the same world-space width. */
export const BOARD_ROUTE_LINK_WIDTH = 0.03;

type TargetOptions = {
  /** Local Y in the route group, whose board position is Y=-0.77. */
  surfaceY?: number;
  linkWidth?: number;
};

function surfaceGeometry(vertices: number[], indices: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ribbonGeometry(paths: MapPoint[][], width: number, y: number) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const radius = width / 2;
  for (const points of paths) {
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1]!,
        b = points[index]!;
      const dx = b.x - a.x,
        dz = b.z - a.z,
        length = Math.hypot(dx, dz);
      if (length < 1e-10) continue;
      const nx = (-dz / length) * radius,
        nz = (dx / length) * radius;
      const start = vertices.length / 3;
      vertices.push(
        a.x + nx,
        y,
        a.z + nz,
        a.x - nx,
        y,
        a.z - nz,
        b.x + nx,
        y,
        b.z + nz,
        b.x - nx,
        y,
        b.z - nz,
      );
      indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
    }
    // Round caps and joins match the atlas stroke without smoothing or widening its path.
    for (const point of points) {
      const start = vertices.length / 3;
      vertices.push(point.x, y, point.z);
      for (let step = 0; step < 12; step++) {
        const angle = (step / 12) * Math.PI * 2;
        vertices.push(point.x + Math.cos(angle) * radius, y, point.z + Math.sin(angle) * radius);
      }
      for (let step = 0; step < 12; step++) {
        indices.push(start, start + 1 + ((step + 1) % 12), start + 1 + step);
      }
    }
  }
  return surfaceGeometry(vertices, indices);
}

/** Targets are route-group local; the caller owns their geometries and shared material. */
export function createBoardRouteTargets(
  route: RouteLayout,
  material: THREE.Material,
  { surfaceY = -0.025, linkWidth = BOARD_ROUTE_LINK_WIDTH }: TargetOptions = {},
): THREE.Mesh[] {
  const targets = route.slots.map((slot) => {
    const halfWidth = (route.width * 0.93) / 2;
    const halfLength = (route.coachLength * 0.93) / 2;
    const cos = Math.cos(slot.angle),
      sin = Math.sin(slot.angle);
    const vertices: number[] = [];
    for (const [x, z] of [
      [-halfWidth, -halfLength],
      [-halfWidth, halfLength],
      [halfWidth, -halfLength],
      [halfWidth, halfLength],
    ]) {
      vertices.push(
        slot.position.x + x! * cos + z! * sin,
        surfaceY,
        slot.position.z - x! * sin + z! * cos,
      );
    }
    const target = new THREE.Mesh(surfaceGeometry(vertices, [0, 1, 2, 2, 1, 3]), material);
    target.userData.boardPickTarget = 'slot';
    return target;
  });
  const inkPaths = (route.inkPaths ?? [route.points]).filter((path) => path.length > 1);
  if (inkPaths.length && linkWidth > 0) {
    const link = new THREE.Mesh(ribbonGeometry(inkPaths, linkWidth, surfaceY), material);
    link.userData.boardPickTarget = 'link';
    targets.push(link);
  }
  for (const target of targets) {
    // Raycaster uses layers, not visibility; omit these targets from rendering entirely.
    target.visible = false;
    target.userData.interaction = { kind: 'edge', id: route.edge.id };
    target.userData.enabled = true;
  }
  return targets;
}
