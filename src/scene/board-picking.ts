import * as THREE from 'three';
import type { TableInteraction } from './interaction';

export function interactionForHit(hit: THREE.Intersection): TableInteraction | undefined {
  const instanceInteraction =
    hit.instanceId === undefined
      ? undefined
      : hit.object.userData.instanceInteractions?.[hit.instanceId];
  return (instanceInteraction ??
    hit.object.userData.interaction ??
    hit.object.userData.selection) as TableInteraction | undefined;
}

/** Printed city names remain targets when a transparent railway hit tube passes above them. */
export function chooseBoardHit(
  hits: THREE.Intersection[],
  camera: THREE.PerspectiveCamera,
  pointer: THREE.Vector2,
  centers: Map<string, THREE.Vector3[]>,
): THREE.Intersection | undefined {
  const label = hits.find((hit) => hit.object.userData.cityLabel);
  if (label) return label;
  const primary = hits[0];
  if (!primary || interactionForHit(primary)?.kind !== 'edge') return primary;

  const candidates = new Map<string, THREE.Intersection>();
  for (const hit of hits) {
    const interaction = interactionForHit(hit);
    if (interaction?.kind === 'edge' && !candidates.has(interaction.id))
      candidates.set(interaction.id, hit);
  }
  if (candidates.size < 2) return primary;

  let chosen = primary;
  let closest = Infinity;
  for (const [id, hit] of candidates) {
    for (const center of centers.get(id) ?? []) {
      const screen = center.clone().project(camera);
      const dx = (screen.x - pointer.x) * camera.aspect;
      const dy = screen.y - pointer.y;
      const distance = dx * dx + dy * dy;
      if (distance < closest) {
        closest = distance;
        chosen = hit;
      }
    }
  }
  return chosen;
}
