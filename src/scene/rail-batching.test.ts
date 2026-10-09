import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { batchRailMiniatures } from './rail-batching';
import { createRailMiniatures } from './rail-miniatures';

function tag(group: THREE.Group, id: string) {
  group.userData.interaction = { kind: 'edge', id };
}

describe('rail miniature instancing', () => {
  it('raycasts two instances to their individual route IDs after batching', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const groups = [-2, 2].map((x, index) => {
      const group = new THREE.Group();
      group.position.x = x;
      tag(group, `route-${index}`);
      group.add(new THREE.Mesh(geometry, material));
      root.add(group);
      return group;
    });
    const result = batchRailMiniatures(root, groups);
    expect(result.meshes).toHaveLength(1);
    expect(result.removed).toHaveLength(2);
    expect(result.meshes[0].count).toBe(2);
    for (const [index, x] of [-2, 2].entries()) {
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(x, 4, 0),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = raycaster.intersectObjects(result.meshes)[0];
      expect(hit.instanceId).toBe(index);
      expect(hit.object.userData.instanceInteractions[hit.instanceId!]).toEqual({
        kind: 'edge',
        id: `route-${index}`,
      });
    }
    expect(result.meshes[0].boundingBox).not.toBeNull();
    expect(result.meshes[0].boundingSphere).not.toBeNull();
  });

  it('preserves nested transforms in root coordinates and leaves unrelated objects intact', () => {
    const scene = new THREE.Group();
    const root = new THREE.Group();
    root.position.set(10, 3, -4);
    root.rotation.y = 0.7;
    root.scale.setScalar(1.4);
    scene.add(root);
    const group = new THREE.Group();
    group.position.set(3, 0.5, -2);
    group.rotation.y = -0.4;
    group.scale.setScalar(0.8);
    tag(group, 'translated-route');
    root.add(group);
    const marker = new THREE.Object3D();
    group.add(marker);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.6),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.set(0.1, 0.2, -0.3);
    group.add(mesh);
    scene.updateWorldMatrix(true, true);
    const oldWorldMatrix = mesh.matrixWorld.clone();
    const result = batchRailMiniatures(root, [group]);
    const localMatrix = new THREE.Matrix4();
    result.meshes[0].getMatrixAt(0, localMatrix);
    const worldMatrix = new THREE.Matrix4().multiplyMatrices(root.matrixWorld, localMatrix);
    worldMatrix.elements.forEach((value, index) =>
      expect(value).toBeCloseTo(oldWorldMatrix.elements[index], 6),
    );
    expect(group.children).toEqual([marker]);
    expect(marker.parent).toBe(group);
    expect(mesh.parent).toBeNull();
  });

  it('keeps different surface and shadow batches separate without disposing reused resources', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const red = new THREE.MeshBasicMaterial({ color: '#aa4433' });
    const blue = new THREE.MeshBasicMaterial({ color: '#3388aa' });
    const disposeGeometry = vi.fn();
    const disposeRed = vi.fn();
    geometry.addEventListener('dispose', disposeGeometry);
    red.addEventListener('dispose', disposeRed);
    const groups = [red, blue, red].map((material, index) => {
      const group = new THREE.Group();
      tag(group, String(index));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = index === 2;
      group.add(mesh);
      root.add(group);
      return group;
    });
    const result = batchRailMiniatures(root, groups);
    expect(result.meshes).toHaveLength(3);
    expect(result.meshes.every((mesh) => mesh.geometry === geometry)).toBe(true);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeRed).not.toHaveBeenCalled();
    expect(root.children).toHaveLength(3);
  });

  it('reduces real coach and slot geometry to shared batches across many routes', () => {
    const root = new THREE.Group();
    const factory = createRailMiniatures();
    const groups: THREE.Group[] = [];
    for (let index = 0; index < 40; index++) {
      const color = index % 2 ? '#b35743' : '#608eaf';
      const coach = factory.addCoach(root, color, 0.62, 0.2852);
      coach.position.x = index;
      coach.scale.setScalar(0.4 + index * 0.01);
      tag(coach, `coach-${index}`);
      groups.push(coach);
      const slot = factory.addTrackSlot(root, color, 0.62, 0.2852);
      slot.position.x = index;
      tag(slot, `slot-${index}`);
      groups.push(slot);
    }
    const result = batchRailMiniatures(root, groups);
    expect(result.removed).toHaveLength(240);
    expect(result.meshes).toHaveLength(8);
    expect(result.meshes.reduce((count, mesh) => count + mesh.count, 0)).toBe(240);
    expect(
      result.meshes.every((mesh) => mesh.userData.instanceInteractions.length === mesh.count),
    ).toBe(true);
  });
});
