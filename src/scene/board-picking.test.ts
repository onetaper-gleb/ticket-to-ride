import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { chooseBoardHit, interactionForHit } from './board-picking';

function targetHit(
  role: 'slot' | 'link' | 'city' | 'label' | 'physical',
  id: string,
  distance: number,
) {
  const object = new THREE.Mesh();
  object.userData.interaction = {
    kind: role === 'city' || role === 'label' ? 'station' : 'edge',
    id,
  };
  if (role === 'label') object.userData.cityLabel = true;
  else if (role !== 'physical') object.userData.boardPickTarget = role;
  return { object, distance, point: new THREE.Vector3() } as THREE.Intersection;
}

describe('board hit priority', () => {
  const camera = new THREE.PerspectiveCamera(43, 16 / 9, 0.1, 180);
  camera.position.set(0, 22, 5);
  camera.lookAt(0, -0.5, 0);
  camera.updateMatrixWorld(true);
  const pointer = new THREE.Vector2();

  it('keeps the nearest actual surface ahead of transparent labels, slots and links', () => {
    const label = targetHit('label', 'paris', 1);
    const slot = targetHit('slot', 'route-a', 2);
    const link = targetHit('link', 'route-a', 3);
    const train = targetHit('physical', 'visible-train', 4);
    const farther = targetHit('physical', 'behind-train', 5);
    const hits = [label, slot, link, train, farther];
    const centers = new Map([['behind-train', [new THREE.Vector3()]]]);
    expect(chooseBoardHit(hits, camera, pointer, centers)).toBe(train);
    train.object.userData.interaction = { kind: 'station', id: 'paris' };
    expect(chooseBoardHit(hits, camera, pointer, centers)).toBe(train);
  });

  it('preserves printed names and route ink ahead of transparent city padding', () => {
    const city = targetHit('city', 'paris', 1);
    const link = targetHit('link', 'route-a', 2);
    const slot = targetHit('slot', 'route-b', 3);
    const label = targetHit('label', 'frankfurt', 4);
    expect(chooseBoardHit([city, link, slot, label], camera, pointer, new Map())).toBe(label);
    expect(chooseBoardHit([city, link, slot], camera, pointer, new Map())).toBe(slot);
    expect(chooseBoardHit([city, link], camera, pointer, new Map())).toBe(link);
    expect(chooseBoardHit([city], camera, pointer, new Map())).toBe(city);
  });

  it('tie-breaks only ray-hit backup routes and does not mutate its inputs', () => {
    const primary = targetHit('link', 'route-a', 1);
    const nearer = targetHit('link', 'route-b', 2);
    const hits = [primary, nearer];
    const centers = new Map([
      ['not-a-ray-hit', [new THREE.Vector3()]],
      ['route-a', [new THREE.Vector3(4, -0.5, 0)]],
      ['route-b', [new THREE.Vector3(0, -0.5, 0)]],
    ]);
    const originalHits = [...hits];
    const originalPointer = pointer.toArray();
    const originalCamera = camera.matrixWorld.toArray();
    const originalCenters = [...centers].map(([id, points]) => [
      id,
      points.map((p) => p.toArray()),
    ]);
    expect(chooseBoardHit(hits, camera, pointer, centers)).toBe(nearer);
    expect(hits).toEqual(originalHits);
    expect(pointer.toArray()).toEqual(originalPointer);
    expect(camera.matrixWorld.toArray()).toEqual(originalCamera);
    expect([...centers].map(([id, points]) => [id, points.map((p) => p.toArray())])).toEqual(
      originalCenters,
    );
    expect(chooseBoardHit(hits, camera, pointer, new Map())).toBe(primary);
    expect(chooseBoardHit([], camera, pointer, centers)).toBeUndefined();
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
    const hit = new THREE.Raycaster(
      new THREE.Vector3(x, 4, 0),
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(mesh)[0]!;
    expect(hit.instanceId).toBe(index);
    expect(interactionForHit(hit)).toEqual({ kind: 'edge', id: index ? 'route-b' : 'route-a' });
  });
  mesh.dispose();
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
});
