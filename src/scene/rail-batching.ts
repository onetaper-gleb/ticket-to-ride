import * as THREE from 'three';
import type { TableInteraction } from './interaction';

type Source = {
  mesh: THREE.Mesh;
  interaction: TableInteraction;
  matrix: THREE.Matrix4;
};

/**
 * Replaces miniature meshes with instanced batches in root-local coordinates.
 * The new meshes inherit resource ownership; removed meshes must not be disposed.
 */
export function batchRailMiniatures(root: THREE.Group, groups: THREE.Group[]) {
  const buckets = new Map<string, Source[]>();
  const visited = new Set<THREE.Mesh>();
  root.updateWorldMatrix(true, true);
  const rootInverse = root.matrixWorld.clone().invert();

  for (const group of groups) {
    group.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        object instanceof THREE.InstancedMesh ||
        !object.visible
      )
        return;
      if (visited.has(object)) return;
      visited.add(object);
      const interaction = findInteraction(object, group);
      if (!interaction) throw new Error('Rail miniature is missing its table interaction');
      const surfaces = Array.isArray(object.material) ? object.material : [object.material];
      const key = [
        object.geometry.uuid,
        surfaces.map((surface) => surface.uuid).join(','),
        object.castShadow,
        object.receiveShadow,
        object.renderOrder,
        object.layers.mask,
      ].join(':');
      const source: Source = {
        mesh: object,
        interaction,
        matrix: new THREE.Matrix4().multiplyMatrices(rootInverse, object.matrixWorld),
      };
      const bucket = buckets.get(key);
      if (bucket) bucket.push(source);
      else buckets.set(key, [source]);
    });
  }

  const meshes: THREE.InstancedMesh[] = [];
  const removed: THREE.Object3D[] = [];
  for (const sources of buckets.values()) {
    const template = sources[0].mesh;
    const mesh = new THREE.InstancedMesh(template.geometry, template.material, sources.length);
    mesh.name = 'Batched railway miniatures';
    mesh.castShadow = template.castShadow;
    mesh.receiveShadow = template.receiveShadow;
    mesh.renderOrder = template.renderOrder;
    mesh.layers.mask = template.layers.mask;
    mesh.userData.instanceInteractions = sources.map((source) => ({ ...source.interaction }));
    mesh.userData.enabled = true;
    sources.forEach((source, index) => mesh.setMatrixAt(index, source.matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    root.add(mesh);
    meshes.push(mesh);
    for (const source of sources) {
      source.mesh.removeFromParent();
      removed.push(source.mesh);
    }
  }
  for (const group of groups) if (group.children.length === 0) group.removeFromParent();
  root.updateWorldMatrix(true, true);
  return { meshes, removed };
}

function findInteraction(object: THREE.Object3D, group: THREE.Group): TableInteraction | null {
  let ancestor: THREE.Object3D | null = object;
  while (ancestor) {
    const interaction = ancestor.userData.interaction as TableInteraction | undefined;
    if (interaction) return interaction;
    if (ancestor === group) break;
    ancestor = ancestor.parent;
  }
  return null;
}
