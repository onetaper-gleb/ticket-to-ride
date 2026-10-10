import * as THREE from 'three';
import { expect, it } from 'vitest';
import { EDGES } from '../data/europe';
import type { RouteLayout } from './board-layout';
import { BOARD_ROUTE_LINK_WIDTH, createBoardRouteTargets } from './board-pick-targets';
import { disposeObjects } from './tabletop';
import { TABLE_CAMERA } from './table-layout';
import { chooseBoardHit, interactionForHit } from './board-picking';

it('leaves underpass gaps unpickable and chooses the printed overpass ID', () => {
  const material = new THREE.MeshBasicMaterial();
  const root = new THREE.Group();
  const base = { edge: EDGES[0]!, coachLength: 0.62, width: 0.2852, slots: [] };
  const underpass: RouteLayout = {
    ...base,
    edge: { ...base.edge, id: 'underpass' },
    points: [
      { x: -1, z: 0 },
      { x: 1, z: 0 },
    ],
    inkPaths: [
      [
        { x: -1, z: 0 },
        { x: -0.06, z: 0 },
      ],
      [
        { x: 0.06, z: 0 },
        { x: 1, z: 0 },
      ],
    ],
  };
  const overpass: RouteLayout = {
    ...base,
    edge: { ...base.edge, id: 'overpass' },
    points: [
      { x: 0, z: -1 },
      { x: 0, z: 1 },
    ],
  };
  const underTargets = createBoardRouteTargets(underpass, material);
  const overTargets = createBoardRouteTargets(overpass, material);
  expect(underTargets).toHaveLength(1);
  root.add(...underTargets, ...overTargets);
  root.updateWorldMatrix(true, true);
  const ray = (x: number, z: number, targets: THREE.Object3D[]) =>
    new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0)).intersectObjects(
      targets,
    );
  expect(ray(0, 0, underTargets)).toHaveLength(0);
  expect(ray(0.035, 0, underTargets)).toHaveLength(0);
  expect(ray(-0.07, 0, underTargets)[0]?.object).toBe(underTargets[0]);
  expect(ray(0.07, 0, underTargets)[0]?.object).toBe(underTargets[0]);
  const hits = ray(0, 0, [...underTargets, ...overTargets]);
  const selected = chooseBoardHit(
    hits,
    new THREE.PerspectiveCamera(),
    new THREE.Vector2(),
    new Map(),
  );
  expect(selected && interactionForHit(selected)).toEqual({ kind: 'edge', id: 'overpass' });
  disposeObjects(root);
});

it('matches the printed polyline and bounded rotated berth footprints', () => {
  const angle = Math.PI / 3;
  const route: RouteLayout = {
    edge: { ...EDGES[0]!, id: 'bounded-test-route' },
    points: [
      { x: -2, z: -1 },
      { x: -2, z: 1 },
      { x: 2, z: 1 },
    ],
    slots: [{ position: { x: 1, z: 1 }, angle }],
    coachLength: 0.62,
    width: 0.2852,
  };
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const root = new THREE.Group();
  const targets = createBoardRouteTargets(route, material, { surfaceY: 0.04 });
  root.add(...targets);
  root.updateMatrixWorld(true);
  const ray = (x: number, z: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0)).intersectObjects(
      targets,
    );
  expect(targets.map((target) => target.userData.boardPickTarget)).toEqual(['slot', 'link']);
  expect(targets.every((target) => !target.visible)).toBe(true);
  expect(ray(-2, 0)[0]!.point.y).toBeCloseTo(0.04);
  expect(ray(-2 + BOARD_ROUTE_LINK_WIDTH * 0.7, 0)).toHaveLength(0);
  expect(ray(0, 0)).toHaveLength(0);
  const offset = (x: number, z: number) => ({
    x: 1 + x * Math.cos(angle) + z * Math.sin(angle),
    z: 1 - x * Math.sin(angle) + z * Math.cos(angle),
  });
  const inside = offset(route.width * 0.4, route.coachLength * 0.4);
  expect(ray(inside.x, inside.z).some((hit) => hit.object === targets[0])).toBe(true);
  const outside = offset(route.width * 0.6, route.coachLength * 0.4);
  expect(ray(outside.x, outside.z).some((hit) => hit.object === targets[0])).toBe(false);
  targets.forEach((target) =>
    expect(target.userData.interaction).toEqual({ kind: 'edge', id: route.edge.id }),
  );
  disposeObjects(root);
});

it.each(['board', 'overview'] as const)(
  'aligns the whole visible atlas stroke with its target in the %s camera',
  (mode) => {
    const material = new THREE.MeshBasicMaterial();
    const root = new THREE.Group();
    root.position.y = -0.77;
    const targets = createBoardRouteTargets(
      {
        edge: EDGES[0]!,
        points: [
          { x: -2, z: 0 },
          { x: 2, z: 0 },
        ],
        slots: [],
        coachLength: 0.62,
        width: 0.2852,
      },
      material,
    );
    root.add(...targets);
    root.updateWorldMatrix(true, true);
    const camera = new THREE.PerspectiveCamera(43, 16 / 9, 0.1, 180);
    camera.position.fromArray(TABLE_CAMERA[mode].position);
    camera.lookAt(new THREE.Vector3(...TABLE_CAMERA[mode].target));
    camera.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const side of [-0.45, 0, 0.45]) {
      const printedPoint = new THREE.Vector3(0, -0.796, side * BOARD_ROUTE_LINK_WIDTH);
      const screen = printedPoint.project(camera);
      ray.setFromCamera(new THREE.Vector2(screen.x, screen.y), camera);
      const hit = ray.intersectObjects(targets)[0];
      expect(hit?.object.userData.interaction, `stroke side ${side}`).toEqual({
        kind: 'edge',
        id: EDGES[0]!.id,
      });
      expect(hit!.point.y).toBeCloseTo(-0.795);
    }
    disposeObjects(root);
  },
);
