import * as THREE from 'three';
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGame, getObservation } from '../core';
import { EDGES } from '../data/europe';
import { presentationCities, routeLayouts, cityLabels } from './board-layout';
import { chooseBoardHit, interactionForHit } from './board-picking';
import type { TableInteraction } from './interaction';
import { TABLE_CAMERA } from './table-layout';
import { physicalBoard as boardGeometry, projectedFootprint } from './board-test-geometry';
import { buildBoard, disposeObjects, type Engine, type MapSelection } from './tabletop';

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

function physicalBoard(occupied: boolean, stations: boolean, selection: MapSelection = null) {
  const observation = getObservation(
    createGame({ playerCount: 4, seed: 'all-board-pick-surfaces' }),
    0,
  );
  // All routes and all 47 stations are geometry stress fixtures, not legal game positions.
  observation.edges.forEach((edge, index) => {
    edge.owner = occupied ? index % observation.players.length : null;
  });
  observation.players.forEach((player, index) => {
    player.stations = stations
      ? observation.cities
          .filter((_, cityIndex) => cityIndex % observation.players.length === index)
          .map((city) => city.id)
      : [];
  });
  const root = new THREE.Group();
  const engine = {
    board: root,
    renderer: { capabilities: { getMaxAnisotropy: () => 8 } },
    pickables: [],
    routePickCenters: new Map<string, THREE.Vector3[]>(),
  } as unknown as Engine;
  buildBoard(engine, observation, selection);
  root.updateWorldMatrix(true, true);
  const cities = presentationCities(observation.cities);
  const routes = routeLayouts(observation.edges, cities);
  return { engine, root, cities, routes, stations, labels: cityLabels(cities, routes) };
}

type PickSample = {
  point: THREE.Vector3;
  interaction: TableInteraction;
  name: string;
  surface?: { oldY: number; actualY: number; physical: boolean };
  slot?: { edgeId: string; index: number };
};
function samplesForBoard(
  board: ReturnType<typeof physicalBoard>,
  surfaceBoard = board,
  offsets = { width: 0.36, length: 0.38 },
  slotsOnly = false,
): PickSample[] {
  const samples: PickSample[] = [];
  for (const route of board.routes) {
    for (const [index, slot] of route.slots.entries()) {
      const center = board.engine.routePickCenters.get(route.edge.id)![index]!;
      for (const [sample, [dx, dz]] of [
        [0, 0],
        [-offsets.width, 0],
        [offsets.width, 0],
        [0, -offsets.length],
        [0, offsets.length],
        [-offsets.width, -offsets.length],
        [offsets.width, -offsets.length],
        [-offsets.width, offsets.length],
        [offsets.width, offsets.length],
      ].entries()) {
        const x = dx! * route.width,
          z = dz! * route.coachLength;
        const point = new THREE.Vector3(
          center.x + x * Math.cos(slot.angle) + z * Math.sin(slot.angle),
          center.y,
          center.z - x * Math.sin(slot.angle) + z * Math.cos(slot.angle),
        );
        // Keep the requested XZ offsets, but click the real roof/body/berth at that location.
        // The centre roof's Y is above the narrower coach's side and corner surfaces.
        const vertical = new THREE.Raycaster(
          new THREE.Vector3(point.x, 3, point.z),
          new THREE.Vector3(0, -1, 0),
        );
        const physical = vertical
          .intersectObjects(surfaceBoard.engine.pickables, false)
          .find((hit) => {
            if (hit.object.userData.boardPickTarget || hit.object.userData.cityLabel) return false;
            const interaction = interactionForHit(hit);
            return interaction?.kind === 'edge' && interaction.id === route.edge.id;
          });
        point.y = physical?.point.y ?? -0.795;
        samples.push({
          point,
          interaction: { kind: 'edge', id: route.edge.id },
          name: `slot ${index}, sample ${sample}`,
          surface: { oldY: center.y, actualY: point.y, physical: !!physical },
          slot: { edgeId: route.edge.id, index },
        });
      }
    }
  }
  if (slotsOnly) return samples;
  for (const label of board.labels) {
    for (const [dx, dz] of [
      [0, 0],
      [-0.3, 0],
      [0.3, 0],
      [0, -0.2],
      [0, 0.2],
    ]) {
      samples.push({
        point: new THREE.Vector3(label.x + dx! * label.width, -0.796, label.z + dz! * label.height),
        interaction: { kind: 'station', id: label.city.id },
        name: `label ${dx},${dz}`,
      });
    }
  }
  for (const city of board.cities) {
    for (const [dx, dz] of [
      [0, 0],
      [-0.07, 0],
      [0.07, 0],
      [0, -0.07],
      [0, 0.07],
    ]) {
      samples.push({
        point: new THREE.Vector3(city.x + dx!, -0.717, city.z + dz!),
        interaction: { kind: 'station', id: city.id },
        name: `pin ${dx},${dz}`,
      });
    }
    if (!board.stations) continue;
    // Body sides, roof slopes and doorway use the actual buildBoard station dimensions.
    for (const [dx, dy, dz] of [
      [0, 0.44, 0],
      [-0.1, 0.39, 0],
      [0.1, 0.39, 0],
      [0, 0.39, -0.1],
      [0, 0.39, 0.1],
      [-0.17, 0.17, 0],
      [0.17, 0.17, 0],
      [0, 0.17, -0.13],
      [0, 0.125, 0.163],
    ]) {
      samples.push({
        point: new THREE.Vector3(city.x + dx!, -0.71 + dy!, city.z + dz!),
        interaction: { kind: 'station', id: city.id },
        name: `station ${dx},${dy},${dz}`,
      });
    }
  }
  return samples;
}

describe('actual buildBoard picking over all 299 free and occupied places', () => {
  let boards: ReturnType<typeof physicalBoard>[];
  beforeAll(() => {
    stubCanvas();
    boards = [
      physicalBoard(false, false),
      physicalBoard(false, true),
      physicalBoard(true, false),
      physicalBoard(true, true),
    ];
  });
  afterAll(() => {
    boards?.forEach((board) => disposeObjects(board.root));
    vi.unstubAllGlobals();
  });

  it('uses bounded per-route targets and actual batched IDs rather than broad hit tubes', () => {
    for (const board of boards) {
      expect(board.routes.reduce((sum, route) => sum + route.slots.length, 0)).toBe(299);
      expect(
        board.engine.pickables.filter((object) => object.userData.boardPickTarget === 'slot'),
      ).toHaveLength(299);
      expect(
        board.engine.pickables.filter((object) => object.userData.boardPickTarget === 'link'),
      ).toHaveLength(101);
      expect(
        board.engine.pickables.filter((object) => object.userData.boardPickTarget === 'city'),
      ).toHaveLength(47);
      expect(board.engine.pickables.filter((object) => object.userData.cityLabel)).toHaveLength(47);
      const physicalCityParts = board.engine.pickables.filter(
        (object) =>
          !object.userData.cityLabel &&
          object.userData.boardPickTarget === undefined &&
          object.userData.interaction?.kind === 'station',
      );
      expect(physicalCityParts).toHaveLength(47 * (board.stations ? 5 : 2));
      expect(
        board.engine.pickables.some(
          (object) => object instanceof THREE.Mesh && object.geometry instanceof THREE.TubeGeometry,
        ),
      ).toBe(false);
      const instances = board.engine.pickables.filter(
        (object) => object instanceof THREE.InstancedMesh,
      );
      expect(instances.length).toBeGreaterThan(0);
      for (const mesh of instances) {
        expect(mesh.userData.instanceInteractions).toHaveLength(mesh.count);
        mesh.userData.instanceInteractions.forEach((interaction: TableInteraction) => {
          expect(interaction.kind).toBe('edge');
          expect(EDGES.some((edge) => edge.id === interaction.id)).toBe(true);
        });
      }
    }
  });

  it('keeps the selected halo on the atlas path in both camera projections', () => {
    const selectedId = 'dieppe--paris-1';
    const selectedBoard = physicalBoard(false, false, { kind: 'edge', id: selectedId });
    try {
      const halos: THREE.Mesh[] = [];
      selectedBoard.root.traverse((object) => {
        if (object instanceof THREE.Mesh && object.userData.highlightForTable?.kind === 'edge') {
          halos.push(object);
        }
      });
      expect(halos).toHaveLength(101);
      expect(
        halos.filter((halo) => halo.visible).map((halo) => halo.userData.highlightForTable.id),
      ).toEqual([selectedId]);
      for (const halo of halos) {
        const id = halo.userData.highlightForTable.id as string;
        expect(selectedBoard.engine.pickables).not.toContain(halo);
        expect(halo.geometry).not.toBeInstanceOf(THREE.TubeGeometry);
        const material = halo.material as THREE.MeshBasicMaterial;
        expect(material.depthWrite).toBe(false);
        expect(material.polygonOffset).toBe(true);
        const vertices = halo.geometry.getAttribute('position');
        const actualPoints = new Set<string>();
        let maxHeightError = 0;
        for (let index = 0; index < vertices.count; index++) {
          const vertex = new THREE.Vector3()
            .fromBufferAttribute(vertices, index)
            .applyMatrix4(halo.matrixWorld);
          maxHeightError = Math.max(maxHeightError, Math.abs(vertex.y + 0.795));
          actualPoints.add(`${vertex.x.toFixed(6)},${vertex.z.toFixed(6)}`);
        }
        expect(maxHeightError, `${id} halo atlas depth`).toBeLessThan(1e-6);
        const route = selectedBoard.routes.find((route) => route.edge.id === id)!;
        expect(
          (route.inkPaths ?? [route.points])
            .flat()
            .every((point) =>
              actualPoints.has(
                `${Math.fround(point.x).toFixed(6)},${Math.fround(point.z).toFixed(6)}`,
              ),
            ),
          `${id} contains every exact printed path node`,
        ).toBe(true);
        const link = selectedBoard.engine.pickables.find(
          (object) =>
            object.userData.boardPickTarget === 'link' && object.userData.interaction.id === id,
        )!;
        for (let index = 1; index < (route.inkPaths?.length ?? 0); index++) {
          const a = route.inkPaths![index - 1]!.at(-1)!;
          const b = route.inkPaths![index]![0]!;
          const ray = new THREE.Raycaster(
            new THREE.Vector3((a.x + b.x) / 2, 2, (a.z + b.z) / 2),
            new THREE.Vector3(0, -1, 0),
          );
          expect(ray.intersectObject(link), `${id} gap ${index} has no route target`).toHaveLength(
            0,
          );
          expect(ray.intersectObject(halo), `${id} gap ${index} has no selected halo`).toHaveLength(
            0,
          );
        }
        for (const mode of ['board', 'overview'] as const) {
          for (const [width, height] of [
            [1280, 720],
            [1920, 1080],
          ]) {
            const camera = new THREE.PerspectiveCamera(43, width! / height!, 0.1, 180);
            camera.position.fromArray(TABLE_CAMERA[mode].position);
            camera.lookAt(new THREE.Vector3(...TABLE_CAMERA[mode].target));
            camera.updateMatrixWorld(true);
            let maxPixelShift = 0;
            for (let index = 0; index < vertices.count; index++) {
              const vertex = new THREE.Vector3()
                .fromBufferAttribute(vertices, index)
                .applyMatrix4(halo.matrixWorld);
              const atlas = vertex.clone().setY(-0.796).project(camera);
              const projected = vertex.project(camera);
              maxPixelShift = Math.max(
                maxPixelShift,
                Math.hypot(
                  ((projected.x - atlas.x) * width!) / 2,
                  ((projected.y - atlas.y) * height!) / 2,
                ),
              );
            }
            expect(maxPixelShift, `${id} ${mode} ${width}×${height}`).toBeLessThan(0.06);
          }
        }
      }
    } finally {
      disposeObjects(selectedBoard.root);
    }
  });

  it.each([
    { occupied: false, stations: false, mode: 'exact-surface' },
    { occupied: false, stations: true, mode: 'exact-surface' },
    { occupied: true, stations: false, mode: 'exact-surface' },
    { occupied: true, stations: true, mode: 'exact-surface' },
    { occupied: false, stations: false, mode: 'pixel-frame' },
    { occupied: false, stations: true, mode: 'pixel-frame' },
    { occupied: true, stations: false, mode: 'pixel-frame' },
    { occupied: true, stations: true, mode: 'pixel-frame' },
    { occupied: true, stations: false, mode: 'pixel-coach-interior' },
    { occupied: true, stations: true, mode: 'pixel-coach-interior' },
    { occupied: true, stations: false, mode: 'pixel-coach-boundary-diagnostic' },
    { occupied: true, stations: true, mode: 'pixel-coach-boundary-diagnostic' },
  ])(
    'selects every surface from the board camera ($mode, occupied=$occupied, stations=$stations)',
    ({ occupied, stations, mode }) => {
      const board = boards[Number(occupied) * 2 + Number(stations)]!;
      const interior = mode === 'pixel-coach-interior';
      const diagnostic = mode === 'pixel-coach-boundary-diagnostic';
      const samples = samplesForBoard(
        board,
        mode === 'pixel-frame' ? boards[Number(stations)]! : board,
        interior ? { width: 0.24, length: 0.28 } : undefined,
        interior || diagnostic,
      );
      expect(samples).toHaveLength(interior || diagnostic ? 2691 : stations ? 3584 : 3161);
      const coachShapes = interior ? boardGeometry(board.routes, board.cities).slots : [];
      const failures: string[] = [];
      const records: object[] = [];
      let minimumCoachMargin = Infinity;
      for (const [width, height] of [
        [1280, 720],
        [1920, 1080],
      ]) {
        const camera = new THREE.PerspectiveCamera(43, width! / height!, 0.1, 180);
        camera.position.fromArray(TABLE_CAMERA.board.position);
        camera.lookAt(new THREE.Vector3(...TABLE_CAMERA.board.target));
        camera.updateMatrixWorld(true);
        const ray = new THREE.Raycaster();
        const coachSilhouettes = new Map(
          coachShapes.map((slot) => [
            `${slot.edgeId}:${slot.index}`,
            projectedFootprint(slot.occupied.vertices, 'board', width!, height!),
          ]),
        );
        for (const sample of samples) {
          const screen = sample.point.clone().project(camera);
          // Clicks land at actual pixel centers at both supported screen sizes.
          const pointer =
            mode === 'exact-surface'
              ? new THREE.Vector2(screen.x, screen.y)
              : new THREE.Vector2(
                  ((Math.floor(((screen.x + 1) * width!) / 2) + 0.5) / width!) * 2 - 1,
                  1 - ((Math.floor(((1 - screen.y) * height!) / 2) + 0.5) / height!) * 2,
                );
          if (interior && sample.slot) {
            const silhouette = coachSilhouettes.get(`${sample.slot.edgeId}:${sample.slot.index}`)!;
            const point = { x: ((screen.x + 1) * width!) / 2, z: ((1 - screen.y) * height!) / 2 };
            const margin = Math.min(
              ...silhouette.map((a, index) => {
                const b = silhouette[(index + 1) % silhouette.length]!;
                const dx = b.x - a.x,
                  dz = b.z - a.z;
                const t = Math.max(
                  0,
                  Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)),
                );
                return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
              }),
            );
            minimumCoachMargin = Math.min(minimumCoachMargin, margin);
            expect(
              margin,
              `${sample.interaction.id} ${sample.name} silhouette pixel margin`,
            ).toBeGreaterThanOrEqual(0.5);
          }
          ray.setFromCamera(pointer, camera);
          const hits = ray.intersectObjects(board.engine.pickables, false);
          const chosen = chooseBoardHit(hits, camera, pointer, board.engine.routePickCenters);
          const interaction = chosen && interactionForHit(chosen);
          if (
            interaction?.kind !== sample.interaction.kind ||
            interaction.id !== sample.interaction.id
          ) {
            const exactPointer = new THREE.Vector2(screen.x, screen.y);
            const exactRay = new THREE.Raycaster();
            exactRay.setFromCamera(exactPointer, camera);
            const exactHits = exactRay.intersectObjects(board.engine.pickables, false);
            const exactChosen = chooseBoardHit(
              exactHits,
              camera,
              exactPointer,
              board.engine.routePickCenters,
            );
            const exactInteraction = exactChosen && interactionForHit(exactChosen);
            if (diagnostic) {
              // A pixel rounded outside the coach silhouette is diagnostic, not an
              // excuse to widen picking. Its original visible surface must still pick.
              expect(exactInteraction, `${sample.interaction.id} exact boundary surface`).toEqual(
                sample.interaction,
              );
            }
            failures.push(
              `${width}×${height} ${sample.interaction.id} ${sample.name} → ${interaction?.kind}:${interaction?.id}`,
            );
            records.push({
              width,
              height,
              expected: sample.interaction,
              actual: interaction ?? null,
              name: sample.name,
              point: sample.point.toArray(),
              surface: sample.surface,
              pointer: pointer.toArray(),
              exactInteraction: exactInteraction ?? null,
              exactHitCount: exactHits.length,
              hits: hits.slice(0, 5).map((hit) => ({
                interaction: interactionForHit(hit),
                target: hit.object.userData.boardPickTarget ?? null,
                cityLabel: !!hit.object.userData.cityLabel,
                point: hit.point.toArray(),
                distance: hit.distance,
                instanceId: hit.instanceId,
              })),
            });
          }
        }
      }
      const auditDirectory = process.env.BOARD_PICK_AUDIT_OUTPUT;
      if (auditDirectory) {
        const surfaceSamples = samples.flatMap((sample) =>
          sample.surface ? [sample.surface] : [],
        );
        fs.writeFileSync(
          `${auditDirectory}/pick-${mode}-${Number(occupied)}-${Number(stations)}.json`,
          JSON.stringify(
            {
              occupied,
              stations,
              mode,
              checks: samples.length * 2,
              ...(interior ? { minimumCoachMargin } : {}),
              physicalSlotSamples: surfaceSamples.filter((sample) => sample.physical).length,
              printedSlotSamples: surfaceSamples.filter((sample) => !sample.physical).length,
              maxSurfaceCorrection: Math.max(
                ...surfaceSamples.map((sample) => Math.abs(sample.oldY - sample.actualY)),
              ),
              failures: records,
            },
            null,
            2,
          ) + '\n',
        );
      }
      if (!diagnostic)
        expect(failures, `${failures.length} incorrect physical-board clicks`).toEqual([]);
    },
    60000,
  );
});
