import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, getObservation } from '../core';
import { EDGES } from '../data/europe';
import { buildBoard, disposeObjects, type Engine } from './tabletop';

function stubCanvas() {
  const context = new Proxy<Record<string, unknown>>(
    {},
    {
      get(target, property) {
        if (property in target) return target[property as string];
        if (property === 'measureText') return (text: string) => ({ width: text.length * 10 });
        if (String(property).startsWith('create')) return () => ({ addColorStop() {} });
        return () => {};
      },
    },
  );
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  });
}

function resources(board: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const instances = new Set<THREE.InstancedMesh>();
  board.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    if (object instanceof THREE.InstancedMesh) instances.add(object);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  return { geometries, materials, textures, instances };
}

describe('physical board rebuild ownership', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('replaces pick targets and releases shared geometry, textures and instances exactly once', () => {
    stubCanvas();
    const board = new THREE.Group();
    const engine = {
      board,
      renderer: { capabilities: { getMaxAnisotropy: () => 8 } },
      pickables: [],
      routePickCenters: new Map<string, THREE.Vector3[]>(),
    } as unknown as Engine;
    const initial = getObservation(
      createGame({ seed: 'board-rebuild-ownership', playerCount: 4 }),
      0,
    );
    buildBoard(engine, initial, null);
    const countByState = new Map<number, number>();
    for (let iteration = 0; iteration < 6; iteration++) {
      const previous = resources(board);
      const disposals = [
        ...previous.geometries,
        ...previous.materials,
        ...previous.textures,
        ...previous.instances,
      ].map((resource) => {
        const listener = vi.fn();
        const events: THREE.EventDispatcher<{ dispose: {} }> = resource;
        events.addEventListener('dispose', listener);
        return listener;
      });
      const oldTargets = new Set(engine.pickables);
      engine.routePickCenters.set('stale-route', [new THREE.Vector3(100, 100, 100)]);
      const observation = structuredClone(initial);
      const occupied = iteration % 2;
      if (occupied) {
        observation.edges.slice(0, 5).forEach((edge) => {
          edge.owner = 0;
        });
        observation.players[0]!.stations = ['paris', 'frankfurt', 'sofia'];
      }
      buildBoard(engine, observation, null);
      disposals.forEach((listener) => expect(listener).toHaveBeenCalledTimes(1));
      expect(engine.routePickCenters.size).toBe(101);
      expect(engine.routePickCenters.has('stale-route')).toBe(false);
      for (const edge of EDGES)
        expect(engine.routePickCenters.get(edge.id)).toHaveLength(edge.length);
      const currentObjects = new Set<THREE.Object3D>();
      board.traverse((object) => currentObjects.add(object));
      expect(new Set(engine.pickables).size).toBe(engine.pickables.length);
      for (const target of engine.pickables) {
        expect(currentObjects.has(target), 'detached or stale pick target').toBe(true);
        expect(oldTargets.has(target), 'pick target from previous board').toBe(false);
      }
      const count = currentObjects.size;
      if (countByState.has(occupied)) expect(count).toBe(countByState.get(occupied));
      else countByState.set(occupied, count);
      expect(previous.textures.size).toBeGreaterThan(0);
      expect(previous.instances.size).toBeGreaterThan(0);
    }
    disposeObjects(board);
    board.clear();
  });
});
