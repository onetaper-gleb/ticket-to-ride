import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CITIES, EDGES } from '../data/europe';
import { presentationCities, routeLayouts, cityLabels } from './board-layout';
import { chooseBoardHit, interactionForHit } from './board-picking';
import { batchRailMiniatures } from './rail-batching';
import { createRailMiniatures } from './rail-miniatures';
import { TABLE_CAMERA } from './table-layout';

const palette: Record<string, string> = {
  red: '#b54e3d',
  blue: '#4a80ab',
  green: '#4b805f',
  yellow: '#d9b44c',
  orange: '#d98643',
  purple: '#b57da5',
  black: '#33383a',
  white: '#ebe3cd',
  gray: '#89877a',
};
const playerColors = ['#e8a548', '#4aacc8', '#b783b6', '#70a969', '#cd6554'];

function dispose(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.InstancedMesh) object.dispose();
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function crossingBoard() {
  const cities = presentationCities(CITIES);
  const routes = routeLayouts(EDGES, cities);
  const root = new THREE.Group();
  const factory = createRailMiniatures();
  const miniatureGroups: THREE.Group[] = [];
  const centers = new Map<string, THREE.Vector3[]>();
  const hitMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  let pickables: THREE.Object3D[] = [];

  // Occupying every route is a geometry stress fixture, not a legal game position.
  for (const [routeIndex, route] of routes.entries()) {
    const group = new THREE.Group();
    group.position.y = -0.77;
    root.add(group);
    const roofCenters: THREE.Vector3[] = [];
    for (const [slotIndex, slot] of route.slots.entries()) {
      const units = [
        factory.addTrackSlot(
          group,
          palette[route.edge.color]!,
          0.62,
          0.2852,
          route.edge.tunnel,
          slotIndex < route.edge.ferries,
        ),
        factory.addCoach(group, playerColors[routeIndex % playerColors.length]!, 0.62, 0.2232),
      ];
      for (const [unitIndex, unit] of units.entries()) {
        unit.scale.setScalar(route.coachLength / 0.62);
        unit.position.set(slot.position.x, unitIndex ? 0.025 : 0, slot.position.z);
        unit.rotation.y = slot.angle;
        miniatureGroups.push(unit);
        unit.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.userData.interaction = { kind: 'edge', id: route.edge.id };
          pickables.push(object);
        });
      }
      roofCenters.push(
        new THREE.Vector3(
          slot.position.x,
          -0.77 + 0.025 + 0.283 * (0.2232 / 0.3) * (route.coachLength / 0.62),
          slot.position.z,
        ),
      );
    }
    centers.set(route.edge.id, roofCenters);
    const curve = new THREE.CatmullRomCurve3(
      route.points.map((point) => new THREE.Vector3(point.x, 0.018, point.z)),
    );
    const hit = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, Math.max(0.12, route.width * 0.68), 4, false),
      hitMaterial,
    );
    hit.userData.interaction = { kind: 'edge', id: route.edge.id };
    group.add(hit);
    pickables.push(hit);
  }
  const batched = batchRailMiniatures(root, miniatureGroups);
  const removed = new Set(batched.removed);
  pickables = pickables.filter((object) => !removed.has(object));
  pickables.push(...batched.meshes);
  const labels = cityLabels(cities, routes);
  for (const label of labels) {
    const target = new THREE.Mesh(new THREE.PlaneGeometry(label.width, label.height), hitMaterial);
    target.rotation.x = -Math.PI / 2;
    target.position.set(label.x, -0.775, label.z);
    target.userData.interaction = { kind: 'station', id: label.city.id };
    target.userData.cityLabel = true;
    root.add(target);
    pickables.push(target);
  }
  for (const city of cities) {
    const target = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16), hitMaterial);
    target.position.set(city.x, -0.705, city.z);
    target.userData.interaction = { kind: 'station', id: city.id };
    root.add(target);
    pickables.push(target);
  }
  root.updateWorldMatrix(true, true);
  const camera = new THREE.PerspectiveCamera(43, 16 / 9, 0.1, 180);
  camera.position.fromArray(TABLE_CAMERA.board.position);
  camera.lookAt(new THREE.Vector3(...TABLE_CAMERA.board.target));
  camera.updateMatrixWorld(true);
  const ray = (point: THREE.Vector3, extra: THREE.Object3D[] = []) => {
    const screen = point.clone().project(camera);
    const pointer = new THREE.Vector2(screen.x, screen.y);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    return { pointer, hits: raycaster.intersectObjects([...pickables, ...extra], false) };
  };
  return { root, centers, camera, ray, labels };
}

describe('board selection over crossing railway miniatures', () => {
  let board: ReturnType<typeof crossingBoard>;
  beforeAll(() => {
    board = crossingBoard();
  });
  afterAll(() => {
    dispose(board.root);
  });

  it.each([
    ['dieppe--london-2', 1],
    ['bruxelles--paris-1', 0],
    ['bruxelles--paris-2', 0],
    ['bruxelles--paris-2', 1],
    ['bruxelles--frankfurt-1', 1],
    ['athina--brindisi-1', 2],
    ['erzurum--sochi-1', 0],
  ] as const)('selects %s slot %i at a dense railway crossing', (id, index) => {
    const { pointer, hits } = board.ray(board.centers.get(id)![index]!);
    expect(hits.some((hit) => interactionForHit(hit)?.id === id)).toBe(true);
    const chosen = chooseBoardHit(hits, board.camera, pointer, board.centers);
    expect(interactionForHit(chosen!)).toEqual({ kind: 'edge', id });
    expect(hits).toContain(chosen);
  });

  it('keeps all 47 printed city names selectable', () => {
    for (const label of board.labels) {
      const { pointer, hits } = board.ray(new THREE.Vector3(label.x, -0.796, label.z));
      const chosen = chooseBoardHit(hits, board.camera, pointer, board.centers);
      expect(interactionForHit(chosen!), label.city.id).toEqual({
        kind: 'station',
        id: label.city.id,
      });
    }
  });

  it('prioritizes a city label beneath a raised train and preserves a direct station hit', () => {
    const point = board.centers.get('dieppe--london-2')![1]!;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), new THREE.MeshBasicMaterial());
    label.rotation.x = -Math.PI / 2;
    label.position.set(point.x, -0.8, point.z);
    label.userData.cityLabel = true;
    label.userData.interaction = { kind: 'station', id: 'dieppe' };
    label.updateMatrixWorld(true);
    const under = board.ray(point, [label]);
    expect(under.hits[0]!.object).not.toBe(label);
    expect(chooseBoardHit(under.hits, board.camera, under.pointer, board.centers)!.object).toBe(
      label,
    );
    dispose(label);

    const station = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial());
    station.position
      .copy(point)
      .addScaledVector(board.camera.position.clone().sub(point).normalize(), 2);
    station.userData.interaction = { kind: 'station', id: 'dieppe' };
    station.updateMatrixWorld(true);
    const direct = board.ray(point, [station]);
    expect(direct.hits[0]!.object).toBe(station);
    expect(chooseBoardHit(direct.hits, board.camera, direct.pointer, board.centers)).toBe(
      direct.hits[0],
    );
    dispose(station);
  });

  it('uses only ray-hit routes without mutating the hit list, camera, pointer or centers', () => {
    const id = 'bruxelles--paris-2';
    const point = board.centers.get(id)![0]!;
    const { pointer, hits } = board.ray(point);
    const centers = new Map([['not-a-ray-hit', [point.clone()]], ...board.centers]);
    const originalCenters = [...centers].map(([key, values]) => [
      key,
      values.map((value) => value.toArray()),
    ]);
    const originalHits = [...hits];
    const originalPointer = pointer.toArray();
    const originalCamera = board.camera.matrixWorld.toArray();
    const chosen = chooseBoardHit(hits, board.camera, pointer, centers);
    expect(interactionForHit(chosen!)).toEqual({ kind: 'edge', id });
    expect(hits).toEqual(originalHits);
    expect(pointer.toArray()).toEqual(originalPointer);
    expect(board.camera.matrixWorld.toArray()).toEqual(originalCamera);
    expect(
      [...centers].map(([key, values]) => [key, values.map((value) => value.toArray())]),
    ).toEqual(originalCenters);
    expect(chooseBoardHit([], board.camera, pointer, centers)).toBeUndefined();
    expect(chooseBoardHit(hits, board.camera, pointer, new Map())).toBe(hits[0]);
  });
});

it('reads both instanced route IDs before mesh-wide metadata, including instance zero', () => {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    2,
  );
  mesh.userData.interaction = { kind: 'edge', id: 'mesh-fallback' };
  mesh.userData.instanceInteractions = [
    { kind: 'edge', id: 'route-a' },
    { kind: 'edge', id: 'route-b' },
  ];
  [-2, 2].forEach((x, index) =>
    mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(x, 0, 0)),
  );
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  [-2, 2].forEach((x, index) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 4, 0), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0]!;
    expect(hit.instanceId).toBe(index);
    expect(interactionForHit(hit)).toEqual({ kind: 'edge', id: index ? 'route-b' : 'route-a' });
  });
  dispose(mesh);
});
