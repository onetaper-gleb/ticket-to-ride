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

function targetPriority(hit: THREE.Intersection) {
  if (hit.object.userData.cityLabel) return 1;
  switch (hit.object.userData.boardPickTarget) {
    case 'slot':
      return 2;
    case 'link':
      return 3;
    case 'city':
      return 4;
    default:
      return 0;
  }
}

/** Visible miniature surfaces win over transparent backup targets. */
export function chooseBoardHit(
  hits: THREE.Intersection[],
  camera: THREE.PerspectiveCamera,
  pointer: THREE.Vector2,
  centers: Map<string, THREE.Vector3[]>,
): THREE.Intersection | undefined {
  let priority = Infinity;
  for (const hit of hits) priority = Math.min(priority, targetPriority(hit));
  const eligible = hits.filter((hit) => targetPriority(hit) === priority);
  const primary = eligible[0];
  // A nearest-center tie-break must never replace a visible, nearer mesh or instance.
  if (priority === 0) return primary;
  if (!primary || interactionForHit(primary)?.kind !== 'edge') return primary;

  const candidates = new Map<string, THREE.Intersection>();
  for (const hit of eligible) {
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
