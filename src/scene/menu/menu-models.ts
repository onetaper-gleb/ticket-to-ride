import * as THREE from 'three';
import {
  createMenuModelKit,
  menuAnchor,
  menuBox,
  type MenuModelKit,
  type MenuSurfaceMaps,
  type MenuSurfaceOverrides,
} from './menu-model-utils';
import { buildMenuTrain } from './menu-train';
import {
  buildMenuBell,
  buildMenuClock,
  buildMenuLamp,
  buildMenuSuitcase,
  buildMenuTicketHolder,
  buildMenuBench,
  buildMenuLuggageTrolley,
  buildMenuSemaphore,
} from './menu-props';

export type MenuModels = {
  root: THREE.Group;
  cashierAnchor: THREE.Object3D;
  railwayRoot: THREE.Group;
  parts: MenuEnvironmentParts;
  /** Actual owned surfaces; material values may be tuned by the scene owner. */
  surfaces: MenuModelKit['surfaces'];
  counter: {
    handRestLeft: THREE.Object3D;
    handRestRight: THREE.Object3D;
    bellAnchor: THREE.Object3D;
    ticketTrayAnchor: THREE.Object3D;
  };
  clock: { root: THREE.Group; hourHand: THREE.Object3D; minuteHand: THREE.Object3D };
  train: { root: THREE.Group; chimneyAnchor: THREE.Object3D; wheels: readonly THREE.Object3D[] };
  board: {
    root: THREE.Group;
    /** Optional owned volume title; SVG parsing and native fallback belong to the caller. */
    titleRoot: THREE.Group;
    setTitleShapes(
      shapes: readonly THREE.Shape[],
      sourceBounds: THREE.Box2,
      titleBounds: THREE.Box2,
    ): void;
    clearTitleShapes(): void;
    settingsRoot: THREE.Group;
    readonly innerPlane: THREE.Mesh;
    readonly settingsPlane: THREE.Mesh;
    bounds: THREE.Box3;
    settingsBounds: THREE.Box3;
    getCorners(): {
      board: readonly THREE.Vector3[];
      settings: readonly THREE.Vector3[];
      aperture: readonly THREE.Vector3[];
      settingsAperture: readonly THREE.Vector3[];
    };
    setLayout(
      bounds: THREE.Box3,
      settingsBounds: THREE.Box3,
      border: number,
      settingsBorder: number,
    ): void;
  };
  dispose(): void;
};

export type MenuEnvironmentParts = {
  stationRoot: THREE.Group;
  lowerFacade: THREE.Group;
  stationFloor: THREE.Group;
  platform: THREE.Group;
  canopy: THREE.Group;
  supports: THREE.Group;
  outerCanopySupport: THREE.Group;
  backdropRoot: THREE.Group;
  interior: THREE.Group;
  luggage: readonly THREE.Group[];
  lamps: readonly THREE.Group[];
  bench: THREE.Group;
  luggageTrolley: THREE.Group;
  semaphore: { root: THREE.Group; armPivot: THREE.Object3D };
};

const FLOOR_Y = -0.9;
const RAIL_Y = -0.65;

export type MenuEnvironmentArt = {
  clockFace?: THREE.Texture;
  luggageStickers?: THREE.Texture;
  wood?: THREE.Texture;
  surfaces?: MenuSurfaceMaps;
  materialOverrides?: MenuSurfaceOverrides;
};

/** Independent station bundle. Contact plane is Y=0; front is +Z. */
export function buildMenuModels(art: MenuEnvironmentArt = {}): MenuModels {
  const kit = createMenuModelKit(art.wood, art.surfaces, art.materialOverrides);
  try {
    const root = new THREE.Group();
    root.name = 'Ticket office environment';
    const stationRoot = part(root, 'station-root');
    const { lowerFacade, interior } = buildFacade(stationRoot, kit);
    const stationFloor = buildStationFloor(root, kit);
    const { railwayRoot, platform } = buildPlatform(root, kit);
    const { canopy, supports, outerCanopySupport } = buildCanopy(stationRoot, kit);
    const backdropRoot = buildBackdrop(root, kit);
    const semaphore = buildMenuSemaphore(kit);
    semaphore.root.position.set(5.0, FLOOR_Y, -8.4);
    backdropRoot.add(semaphore.root);
    const bench = buildMenuBench(kit);
    bench.position.set(1.7, FLOOR_Y, 2.8);
    bench.rotation.y = -1.2;
    root.add(bench);
    const luggageTrolley = buildMenuLuggageTrolley(kit);
    luggageTrolley.position.set(2.05, FLOOR_Y, 0.55);
    luggageTrolley.rotation.y = -0.18;
    root.add(luggageTrolley);

    const cashierAnchor = menuAnchor(stationRoot, 'cashierAnchor', [0, 0, 0.02]);
    const counter = {
      handRestLeft: menuAnchor(stationRoot, 'handRestLeft', [0.35, 0, 0.17]),
      handRestRight: menuAnchor(stationRoot, 'handRestRight', [-0.35, 0, 0.17]),
      bellAnchor: menuAnchor(stationRoot, 'bellAnchor', [0.76, 0, 0.18]),
      ticketTrayAnchor: menuAnchor(stationRoot, 'ticketTrayAnchor', [-0.7, 0, 0.12]),
    };
    counter.bellAnchor.add(buildMenuBell(kit));
    counter.ticketTrayAnchor.add(buildMenuTicketHolder(kit));

    const board = buildBoard(stationRoot, kit);
    const clock = buildMenuClock(kit, art.clockFace);
    clock.root.position.set(1.36, 1.3, -0.03);
    stationRoot.add(clock.root);
    const lamps: THREE.Group[] = [];
    for (const [index, [x, y, z]] of [
      [-2.0, 2.53, 0.38],
      [0.3, 1.98, -0.75],
      [5.7, 2.495, -2.15],
    ].entries()) {
      const lamp = buildMenuLamp(kit, {
        compact: index === 1,
        compactHeight: index === 1 ? 0.045 : undefined,
        stemExtension: index === 0 ? 0.2 : 0,
      });
      lamp.name = ['lamp-board', 'lamp-window', 'lamp-distant'][index];
      lamp.position.set(x, y, z);
      stationRoot.add(lamp);
      lamps.push(lamp);
    }
    const train = buildMenuTrain(kit);
    train.root.position.set(0, 0, 0);
    train.root.rotation.y = -0.65;
    railwayRoot.add(train.root);
    const luggage = buildLuggage(root, kit, art.luggageStickers);
    const parts = {
      stationRoot,
      lowerFacade,
      stationFloor,
      platform,
      canopy,
      supports,
      outerCanopySupport,
      backdropRoot,
      interior,
      luggage,
      lamps,
      bench,
      luggageTrolley,
      semaphore,
    };
    kit.consolidate(stationRoot, [
      board.root,
      board.settingsRoot,
      root.getObjectByName('settings-hangers')!,
      clock.root,
      root.getObjectByName('bell-button')!,
      lowerFacade,
      canopy,
      supports,
      interior,
      ...lamps,
    ]);
    kit.consolidate(root, [
      stationRoot,
      stationFloor,
      railwayRoot,
      backdropRoot,
      bench,
      luggageTrolley,
      ...luggage,
    ]);
    return {
      root,
      cashierAnchor,
      railwayRoot,
      parts,
      surfaces: kit.surfaces,
      counter,
      clock,
      train,
      board,
      dispose: kit.dispose,
    };
  } catch (error) {
    kit.dispose();
    throw error;
  }
}

function part(
  root: THREE.Object3D,
  name: string,
  position: readonly [number, number, number] = [0, 0, 0],
) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  root.add(group);
  return group;
}

function extrude(shape: THREE.Shape, depth: number, bevel = 0.02) {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 10,
  });
}

function verticalWood(geometry: THREE.BufferGeometry) {
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index++)
    uv.setXY(index, 1 - uv.getY(index), uv.getX(index));
  return geometry;
}

function roundedPanel(width: number, height: number, radius: number) {
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  shape.closePath();
  return shape;
}

function frameShape(
  width: number,
  height: number,
  border: number,
  outerRadius: number,
  innerRadius: number,
) {
  const frame = roundedPanel(width, height, outerRadius);
  frame.holes.push(roundedPanel(width - 2 * border, height - 2 * border, innerRadius));
  return frame;
}

/** Small handmade edge variations stay inside the measured settings rectangle. */
function paperPlate(width: number, height: number, radius: number) {
  const x = width / 2;
  const y = height / 2;
  const r = Math.min(radius, width / 8, height / 5);
  const wobble = Math.min(0.003, height / 90);
  const shape = new THREE.Shape();
  shape.moveTo(-x + r, -y);
  shape.bezierCurveTo(-x / 3, -y + wobble, x / 3, -y + wobble * 0.3, x - r, -y);
  shape.quadraticCurveTo(x, -y, x, -y + r);
  shape.bezierCurveTo(x - wobble, -y / 3, x - wobble * 0.4, y / 3, x, y - r);
  shape.quadraticCurveTo(x, y, x - r, y);
  shape.bezierCurveTo(x / 3, y - wobble * 0.5, -x / 3, y - wobble, -x + r, y);
  shape.quadraticCurveTo(-x, y, -x, y - r);
  shape.bezierCurveTo(-x + wobble * 0.3, y / 3, -x + wobble, -y / 3, -x, -y + r);
  shape.quadraticCurveTo(-x, -y, -x + r, -y);
  shape.closePath();
  return shape;
}

function buildFacade(root: THREE.Group, kit: MenuModelKit) {
  const batch = kit.batch(root, 'facade-and-counter');
  const wall = new THREE.Shape();
  wall.moveTo(-4.8, -0.08);
  wall.lineTo(-0.9, -0.08);
  wall.lineTo(-0.9, 1.8);
  wall.quadraticCurveTo(0, 2.06, 0.9, 1.8);
  wall.lineTo(0.9, -0.08);
  wall.lineTo(1.03, -0.08);
  wall.lineTo(1.03, 2.6);
  wall.lineTo(-4.8, 2.6);
  wall.closePath();
  batch.add(extrude(wall, 0.27, 0), 'cream', [0, 0, -0.34]);
  const lowerFacade = part(root, 'lower-facade', [0, FLOOR_Y, 0]);
  const lower = kit.batch(lowerFacade, 'lower-facade');
  lower.add(menuBox(5.83, -0.08 - FLOOR_Y, 0.27), 'cream', [-1.885, (-0.08 - FLOOR_Y) / 2, -0.205]);
  lower.add(menuBox(5.83, 0.15, 0.34), 'green', [-1.885, 0.075, -0.15]);
  lower.add(menuBox(1.79, -0.13 - FLOOR_Y, 0.25), 'green', [0, (-0.13 - FLOOR_Y) / 2, -0.01]);
  const panel = frameShape(1.48, 0.58, 0.026, 0.012, 0.008);
  lower.add(extrude(panel, 0.035, 0.006), 'green', [0, 0.38, 0.14]);
  lower.add(menuBox(1.405, 0.505, 0.022, 0.006), 'green', [0, 0.38, 0.14]);
  for (const x of [-0.82, 0.82]) {
    lower.add(menuBox(0.085, 0.71, 0.045, 0.012), 'green', [x, 0.405, 0.15]);
    lower.add(menuBox(0.14, 0.09, 0.13, 0.018), 'green', [x, 0.06, 0.13]);
  }
  lower.flush();
  for (const x of [-0.93, 0.93]) {
    batch.add(verticalWood(menuBox(0.13, 1.83, 0.33, 0.02)), 'wood', [x, 0.845, -0.12]);
    batch.add(verticalWood(menuBox(0.035, 1.78, 0.12, 0.01)), 'woodDark', [
      x + (x > 0 ? -0.05 : 0.05),
      0.83,
      -0.12,
    ]);
    batch.add(verticalWood(menuBox(0.024, 1.77, 0.06, 0.009)), 'wood', [
      x + (x > 0 ? 0.025 : -0.025),
      0.83,
      0.067,
    ]);
  }
  const arch = new THREE.Shape();
  arch.moveTo(-1.04, 1.68);
  arch.quadraticCurveTo(0, 2.04, 1.04, 1.68);
  arch.lineTo(1.04, 1.91);
  arch.quadraticCurveTo(0, 2.3, -1.04, 1.91);
  arch.closePath();
  batch.add(extrude(arch, 0.32, 0.018), 'wood', [0, 0, -0.23]);
  const innerArch = new THREE.Shape();
  innerArch.moveTo(-0.875, 1.66);
  innerArch.quadraticCurveTo(0, 2.025, 0.875, 1.66);
  innerArch.lineTo(0.875, 1.695);
  innerArch.quadraticCurveTo(0, 2.06, -0.875, 1.695);
  innerArch.closePath();
  batch.add(extrude(innerArch, 0.035, 0.004), 'woodDark', [0, 0, 0.048]);
  batch.add(menuBox(2.03, 0.13, 0.7, 0.035), 'wood', [0, -0.065, 0.04]);
  // Preserve the contact surface exactly at Y=0; mouldings remain below it.
  batch.add(menuBox(2.035, 0.025, 0.045, 0.01), 'wood', [0, -0.061, 0.389]);
  batch.add(menuBox(1.99, 0.027, 0.035, 0.009), 'woodDark', [0, -0.108, 0.366]);
  batch.add(menuBox(1.93, 0.042, 0.6, 0.012), 'wood', [0, -0.148, 0.02]);
  batch.flush();
  const interior = buildInterior(root, kit);
  return { lowerFacade, interior };
}

function buildInterior(root: THREE.Group, kit: MenuModelKit) {
  const interior = part(root, 'cashier-interior', [0, 0, -1.1]);
  const batch = kit.batch(interior, 'cashier-interior');
  // The doorway is an actual opening in the back wall, with a deeper jamb and threshold.
  const back = new THREE.Shape();
  back.moveTo(-1.1, -0.9);
  back.lineTo(0.39, -0.9);
  back.lineTo(0.39, 1.15);
  back.quadraticCurveTo(0.7, 1.81, 1.01, 1.15);
  back.lineTo(1.01, -0.9);
  back.lineTo(1.1, -0.9);
  back.lineTo(1.1, 2.1);
  back.lineTo(-1.1, 2.1);
  back.closePath();
  batch.add(extrude(back, 0.075, 0), 'woodDark', [0, 0, -0.04]);
  batch.add(menuBox(0.1, 2.78, 1.02), 'woodDark', [-0.94, 0.49, 0.39]);
  batch.add(menuBox(0.1, 3.0, 1.02), 'woodDark', [1.1, 0.6, 0.39]);
  batch.add(menuBox(1.9, 0.09, 1.13), 'woodDark', [0, 2.025, 0.3]);
  batch.add(menuBox(0.2, 0.065, 0.48), 'wood', [0, 2.0125, 0.4]);
  for (const x of [0.335, 1.065]) {
    batch.add(verticalWood(menuBox(0.1, 2.3, 0.19, 0.016)), 'wood', [x, 0.28, 0.085]);
    batch.add(menuBox(0.025, 2.25, 0.045), 'woodDark', [x + (x < 0.7 ? 0.05 : -0.05), 0.28, 0.18]);
  }
  const doorArch = new THREE.Shape();
  doorArch.moveTo(0.325, 1.12);
  doorArch.quadraticCurveTo(0.7, 1.92, 1.075, 1.12);
  doorArch.lineTo(0.975, 1.12);
  doorArch.quadraticCurveTo(0.7, 1.63, 0.425, 1.12);
  doorArch.closePath();
  batch.add(extrude(doorArch, 0.19, 0.01), 'wood', [0, 0, -0.03]);
  batch.add(menuBox(0.62, 0.055, 0.27), 'wood', [0.7, -0.07, 0.04]);
  // Recessed plaster reveals and a distant view keep the aperture from reading as a painted blue patch.
  batch.add(menuBox(0.65, 3.0, 0.06), 'cream', [0.7, 0.6, -1.15]);
  batch.add(menuBox(0.63, 0.52, 0.02), 'sky', [0.7, 0.98, -1.12]);
  batch.add(menuBox(0.16, 0.32, 0.09), 'wood', [0.83, 0.18, -0.6]);
  for (const x of [-0.88, -0.47, -0.045])
    batch.add(verticalWood(menuBox(0.047, 1.91, 0.09, 0.009)), 'wood', [x, 0.97, 0.15]);
  for (const y of [0.25, 0.68, 1.13, 1.58]) {
    batch.add(menuBox(0.87, 0.065, 0.27, 0.008), 'wood', [-0.465, y, 0.17]);
    batch.add(menuBox(0.88, 0.027, 0.03), 'woodDark', [-0.465, y - 0.03, 0.314]);
    for (let index = 0; index < 4; index++) {
      const height = [0.16, 0.21, 0.13, 0.18][index];
      const x = -0.78 + index * 0.19;
      batch.add(menuBox(0.145, height, 0.13, 0.005), index % 2 ? 'cream' : 'paper', [
        x,
        y + 0.033 + height / 2,
        0.19,
      ]);
      batch.add(new THREE.BoxGeometry(0.145, 0.014, 0.005), 'woodDark', [x, y + 0.1, 0.259]);
    }
  }
  batch.flush();
  return interior;
}

function buildBoard(root: THREE.Group, kit: MenuModelKit): MenuModels['board'] {
  const boardRoot = new THREE.Group();
  boardRoot.name = 'boardFrame';
  root.add(boardRoot);
  const titleRoot = new THREE.Group();
  titleRoot.name = 'board-title';
  titleRoot.visible = false;
  boardRoot.add(titleRoot);
  let titleKey = '';
  let titleBaseSize = new THREE.Vector2();
  const settingsRoot = new THREE.Group();
  settingsRoot.name = 'settingsFrame';
  root.add(settingsRoot);
  const hangersRoot = new THREE.Group();
  hangersRoot.name = 'settings-hangers';
  settingsRoot.add(hangersRoot);
  const bounds = new THREE.Box3();
  const settingsBounds = new THREE.Box3();
  let innerPlane: THREE.Mesh;
  let settingsPlane: THREE.Mesh;
  let boardBorder = 0;
  let settingsFrameBorder = 0;

  function setTitleShapes(
    shapes: readonly THREE.Shape[],
    sourceBounds: THREE.Box2,
    titleBounds: THREE.Box2,
  ) {
    kit.assertAlive();
    const sourceSize = sourceBounds.getSize(new THREE.Vector2());
    const targetSize = titleBounds.getSize(new THREE.Vector2());
    const targetCentre = new THREE.Vector2(
      titleBounds.min.x / 2 + titleBounds.max.x / 2,
      titleBounds.min.y / 2 + titleBounds.max.y / 2,
    );
    const boardSize = bounds.getSize(new THREE.Vector3());
    if (
      ![
        ...sourceBounds.min.toArray(),
        ...sourceBounds.max.toArray(),
        ...titleBounds.min.toArray(),
        ...titleBounds.max.toArray(),
        sourceSize.x,
        sourceSize.y,
        targetSize.x,
        targetSize.y,
        ...targetCentre.toArray(),
      ].every(Number.isFinite) ||
      sourceSize.x <= 0 ||
      sourceSize.y <= 0 ||
      targetSize.x <= 0 ||
      targetSize.y <= 0 ||
      titleBounds.min.x < -boardSize.x / 2 + boardBorder ||
      titleBounds.max.x > boardSize.x / 2 - boardBorder ||
      titleBounds.min.y < -boardSize.y / 2 + boardBorder ||
      titleBounds.max.y > boardSize.y / 2 - boardBorder ||
      !Array.isArray(shapes) ||
      shapes.length === 0
    )
      throw new RangeError('Invalid menu title bounds or shapes');
    // Sample into owned outlines: caller paths/curves and both boxes remain untouched.
    const outlines = shapes.map((shape) => {
      if (!(shape instanceof THREE.Shape)) throw new RangeError('Invalid menu title shape');
      const { shape: contour, holes } = shape.extractPoints(16);
      for (const points of [contour, ...holes]) {
        if (
          points.length < 3 ||
          points.some(
            (point) =>
              !Number.isFinite(point.x) ||
              !Number.isFinite(point.y) ||
              !sourceBounds.containsPoint(point),
          ) ||
          !Number.isFinite(THREE.ShapeUtils.area(points)) ||
          Math.abs(THREE.ShapeUtils.area(points)) < 1e-10 * sourceSize.x * sourceSize.y
        )
          throw new RangeError('Invalid menu title contour');
      }
      return { contour, holes };
    });
    const key = JSON.stringify([
      sourceBounds.min.toArray(),
      sourceBounds.max.toArray(),
      outlines.map(({ contour, holes }) => [
        contour.map((p) => p.toArray()),
        holes.map((h) => h.map((p) => p.toArray())),
      ]),
    ]);
    const reuse = key === titleKey && titleRoot.children.length > 0;
    const nextScale = reuse
      ? new THREE.Vector2(targetSize.x / titleBaseSize.x, targetSize.y / titleBaseSize.y)
      : new THREE.Vector2(1, 1);
    if (
      !Number.isFinite(nextScale.x) ||
      !Number.isFinite(nextScale.y) ||
      nextScale.x <= 0 ||
      nextScale.y <= 0
    )
      throw new RangeError('Invalid menu title scale');
    if (!reuse) {
      const points = (path: readonly THREE.Vector2[]) =>
        path.map(
          (p) =>
            new THREE.Vector2(
              ((p.x - sourceBounds.min.x) / sourceSize.x - 0.5) * targetSize.x,
              (0.5 - (p.y - sourceBounds.min.y) / sourceSize.y) * targetSize.y,
            ),
        );
      const ownedShapes = outlines.map(({ contour, holes }) => {
        const shape = new THREE.Shape(points(contour));
        shape.holes = holes.map((hole) => new THREE.Path(points(hole)));
        return shape;
      });
      const pending = new THREE.Group();
      let geometry: THREE.BufferGeometry | undefined;
      try {
        geometry = new THREE.ExtrudeGeometry(ownedShapes, {
          depth: 0.008,
          bevelEnabled: true,
          bevelThickness: 0.001,
          bevelSize: 0.001,
          bevelSegments: 1,
          steps: 1,
          curveSegments: 1,
        });
        kit.mesh(pending, geometry, 'brass', 'board-title-letters');
      } catch (error) {
        if (geometry) kit.releaseGeometry(geometry);
        throw error;
      }
      kit.clearMeshes(titleRoot);
      titleRoot.add(...pending.children);
      titleBaseSize = targetSize.clone();
      titleKey = key;
    }
    titleRoot.position.set(targetCentre.x, targetCentre.y, 0);
    titleRoot.scale.set(nextScale.x, nextScale.y, 1);
    titleRoot.visible = true;
  }

  function clearTitleShapes() {
    kit.assertAlive();
    kit.clearMeshes(titleRoot);
    titleKey = '';
    titleBaseSize.set(0, 0);
    titleRoot.visible = false;
    titleRoot.position.set(0, 0, 0);
    titleRoot.scale.set(1, 1, 1);
  }
  function setLayout(
    nextBounds: THREE.Box3,
    nextSettings: THREE.Box3,
    border: number,
    settingsBorder: number,
  ) {
    kit.assertAlive();
    const size = nextBounds.getSize(new THREE.Vector3());
    const settingsSize = nextSettings.getSize(new THREE.Vector3());
    if (
      ![
        ...nextBounds.min.toArray(),
        ...nextBounds.max.toArray(),
        ...nextSettings.min.toArray(),
        ...nextSettings.max.toArray(),
        border,
        settingsBorder,
      ].every(Number.isFinite) ||
      border <= 0 ||
      settingsBorder <= 0 ||
      size.x <= border * 2 ||
      size.y <= border * 2 ||
      settingsSize.x <= settingsBorder * 2 ||
      settingsSize.y <= settingsBorder * 2 ||
      size.z < 0 ||
      settingsSize.z < 0
    )
      throw new Error('Invalid menu board layout');
    bounds.copy(nextBounds);
    settingsBounds.copy(nextSettings);
    boardBorder = border;
    settingsFrameBorder = settingsBorder;
    bounds.min.z = bounds.max.z - 0.04;
    settingsBounds.min.z = settingsBounds.max.z - 0.04;
    // Layout clears only the frame; a stable title extrusion survives until the next rect.
    titleRoot.removeFromParent();
    try {
      kit.clearMeshes(boardRoot);
    } finally {
      boardRoot.add(titleRoot);
    }
    titleRoot.visible = false;
    kit.clearMeshes(settingsRoot);
    kit.clearMeshes(hangersRoot);
    nextBounds.getCenter(boardRoot.position);
    nextSettings.getCenter(settingsRoot.position);
    boardRoot.position.z = nextBounds.max.z;
    settingsRoot.position.z = nextSettings.max.z;
    hangersRoot.position.set(0, 0, 0);
    const pixel = border / 12;
    const settingsPixel = settingsBorder / 6;
    const batch = kit.batch(boardRoot, 'board-frame');
    batch.add(
      extrude(frameShape(size.x, size.y, border, pixel * 8, pixel * 3), 0.035, 0),
      'green',
      [0, 0, -0.04],
    );
    batch.add(
      extrude(
        frameShape(
          size.x - 2 * border + 4.4 * pixel,
          size.y - 2 * border + 4.4 * pixel,
          pixel * 2.2,
          pixel * 5.2,
          pixel * 3,
        ),
        0.012,
        0,
      ),
      'brass',
      [0, 0, -0.004],
    );
    innerPlane = kit.mesh(
      boardRoot,
      new THREE.ShapeGeometry(roundedPanel(size.x - 2 * border, size.y - 2 * border, pixel * 3), 4),
      'boardPaint',
      'boardInnerPlane',
    );
    for (const x of [-size.x / 2 + border * 0.5, size.x / 2 - border * 0.5])
      for (const y of [-size.y / 2 + border * 0.5, size.y / 2 - border * 0.5]) {
        batch.add(
          new THREE.CylinderGeometry(pixel * 5.9, pixel * 5.9, 0.003, 16),
          'brass',
          [x, y, -0.0035],
          [Math.PI / 2, 0, 0],
        );
        const fixing = new THREE.SphereGeometry(pixel * 5.6, 16, 8);
        fixing.scale(1, 1, 0.006 / (pixel * 5.6));
        batch.add(fixing, 'brass', [x, y, 0]);
        batch.add(menuBox(pixel * 5, pixel * 0.55, 0.001, 0), 'iron', [x, y, 0.006]);
      }
    batch.flush();
    const settings = kit.batch(settingsRoot, 'settings-frame');
    const paperFrame = paperPlate(settingsSize.x, settingsSize.y, settingsPixel * 2.8);
    paperFrame.holes.push(
      roundedPanel(
        settingsSize.x - 2 * settingsBorder,
        settingsSize.y - 2 * settingsBorder,
        settingsPixel * 3,
      ),
    );
    settings.add(extrude(paperFrame, 0.04, 0), 'paper', [0, 0, -0.04]);
    settings.add(
      extrude(
        frameShape(
          settingsSize.x - settingsPixel * 2.2,
          settingsSize.y - settingsPixel * 2.2,
          settingsPixel * 0.9,
          settingsPixel * 2.3,
          settingsPixel * 1.4,
        ),
        0.003,
        0,
      ),
      'paper',
      [0, 0, -0.0005],
    );
    const hangers = kit.batch(hangersRoot, 'settings-hangers');
    for (const x of [-settingsSize.x * 0.4, settingsSize.x * 0.4]) {
      hangers.add(new THREE.TorusGeometry(0.028, 0.008, 5, 10), 'brass', [
        x,
        settingsSize.y / 2 + 0.1,
        -0.02,
      ]);
      const hook = new THREE.CubicBezierCurve3(
        new THREE.Vector3(x, settingsSize.y / 2 + 0.115, -0.02),
        new THREE.Vector3(x - 0.014, settingsSize.y / 2 + 0.065, -0.024),
        new THREE.Vector3(x + 0.021, settingsSize.y / 2 - 0.035, 0.017),
        new THREE.Vector3(x + 0.006, settingsSize.y / 2 + 0.012, 0.012),
      );
      hangers.add(new THREE.TubeGeometry(hook, 16, 0.006, 7, false), 'brass');
    }
    hangers.flush();
    settingsPlane = kit.mesh(
      settingsRoot,
      new THREE.ShapeGeometry(
        roundedPanel(
          settingsSize.x - 2 * settingsBorder,
          settingsSize.y - 2 * settingsBorder,
          settingsPixel * 3,
        ),
        4,
      ),
      'paper',
      'settingsInnerPlane',
    );
    settings.flush();
  }
  setLayout(
    new THREE.Box3(new THREE.Vector3(-3.3, -0.27, 0.04), new THREE.Vector3(-1.0, 1.936, 0.04)),
    new THREE.Box3(new THREE.Vector3(-3.23, -0.75, 0.04), new THREE.Vector3(-1.07, -0.4, 0.04)),
    0.066,
    0.033,
  );
  return {
    root: boardRoot,
    titleRoot,
    setTitleShapes,
    clearTitleShapes,
    settingsRoot,
    get innerPlane() {
      return innerPlane;
    },
    get settingsPlane() {
      return settingsPlane;
    },
    bounds,
    settingsBounds,
    setLayout,
    getCorners() {
      kit.assertAlive();
      const corners = (node: THREE.Group, box: THREE.Box3, inset = 0) => {
        node.updateWorldMatrix(true, false);
        const size = box.getSize(new THREE.Vector3());
        const x = size.x / 2 - inset;
        const y = size.y / 2 - inset;
        return [
          new THREE.Vector3(-x, y, 0),
          new THREE.Vector3(x, y, 0),
          new THREE.Vector3(x, -y, 0),
          new THREE.Vector3(-x, -y, 0),
        ].map((point) => point.applyMatrix4(node.matrixWorld));
      };
      return {
        board: corners(boardRoot, bounds),
        settings: corners(settingsRoot, settingsBounds),
        aperture: corners(boardRoot, bounds, boardBorder),
        settingsAperture: corners(settingsRoot, settingsBounds, settingsFrameBorder),
      };
    },
  };
}

function buildCanopy(root: THREE.Group, kit: MenuModelKit) {
  const canopy = part(root, 'station-canopy', [0, 2.63, 0]);
  const batch = kit.batch(canopy, 'canopy');
  batch.add(menuBox(5.9, 0.15, 1.7), 'green', [-1.885, 0, -0.93]);
  batch.add(menuBox(5.84, 0.05, 1.58), 'wood', [-1.885, -0.1, -0.93]);
  batch.add(menuBox(6.2, 0.18, 3.6), 'green', [4.05, 0, -1.0]);
  batch.add(menuBox(6.14, 0.045, 3.43), 'wood', [4.05, -0.1125, -1.0]);
  for (const z of [0.73, -0.13, -1.45, -2.68])
    batch.add(menuBox(6.2, 0.17, 0.13, 0.015), 'green', [4.05, -0.15, z]);
  for (const x of [1.01, 2.5, 4.1, 6.0, 7.08])
    batch.add(menuBox(0.12, 0.145, 3.45, 0.014), 'green', [x, -0.17, -1.0]);
  batch.add(menuBox(6.2, 0.13, 0.12, 0.015), 'cream', [4.05, -0.17, 0.78]);
  batch.add(menuBox(6.3, 0.16, 0.17, 0.018), 'green', [0, -0.1, -0.14]);
  batch.add(menuBox(0.045, 0.04, 0.64), 'iron', [-2.0, -0.08, 0.1]);
  const scallop = new THREE.Shape();
  scallop.moveTo(-0.17, 0);
  scallop.lineTo(0.17, 0);
  scallop.lineTo(0.17, -0.035);
  scallop.quadraticCurveTo(0.16, -0.19, 0, -0.19);
  scallop.quadraticCurveTo(-0.16, -0.19, -0.17, -0.035);
  scallop.closePath();
  for (let x = 1.12; x < 7.15; x += 0.34)
    batch.add(extrude(scallop, 0.065, 0.006), 'cream', [x, -0.21, 0.75]);
  batch.flush();
  const supports = part(root, 'station-supports', [0, FLOOR_Y, 0]);
  const posts = kit.batch(supports, 'canopy-supports');
  const outerCanopySupport = part(supports, 'canopy-right-support', [4.35, 0, -0.2]);
  const rightPost = kit.batch(outerCanopySupport, 'canopy-right-support');
  for (const [x, z] of [
    [-3.4, -0.2],
    [-1.28, -0.2],
    [1.16, -0.2],
    [4.35, -0.2],
  ]) {
    const target = x === 4.35 ? rightPost : posts;
    const localX = x === 4.35 ? 0 : x,
      localZ = x === 4.35 ? 0 : z;
    const height = 2.58 - FLOOR_Y;
    target.add(profiledPost(0.18, 0.25, height), 'green', [localX, 0, localZ]);
    for (const [w, h, y] of [
      [0.3, 0.12, 0.06],
      [0.265, 0.15, 0.195],
      [0.24, 0.07, 0.31],
      [0.23, 0.06, 0.95],
      [0.235, 0.13, 1.04],
      [0.23, 0.055, 2.2],
      [0.26, 0.14, height - 0.18],
    ])
      target.add(menuBox(w, h, w + 0.03, 0.015), 'green', [localX, y, localZ]);
    target.add(menuBox(0.29, 0.11, 0.31, 0.01), 'cream', [localX, -0.06 - FLOOR_Y, localZ]);
    const corbel = new THREE.Shape();
    corbel.moveTo(0, height - 0.67);
    corbel.lineTo(0.11, height - 0.67);
    corbel.quadraticCurveTo(0.14, height - 0.24, 0.59, height - 0.17);
    corbel.lineTo(0.66, height - 0.17);
    corbel.lineTo(0.66, height + 0.015);
    corbel.lineTo(0, height + 0.015);
    corbel.closePath();
    target.add(extrude(corbel, 0.15, 0.008), 'green', [localX, 0, localZ - 0.075]);
  }
  posts.flush();
  rightPost.flush();
  return { canopy, supports, outerCanopySupport };
}

function profiledPost(width: number, depth: number, height: number) {
  const w = width / 2,
    d = depth / 2,
    inset = 0.018,
    flange = 0.028;
  const shape = new THREE.Shape();
  shape.moveTo(-w, -d);
  shape.lineTo(-w + flange, -d);
  shape.lineTo(-w + flange, -d + inset);
  shape.lineTo(w - flange, -d + inset);
  shape.lineTo(w - flange, -d);
  shape.lineTo(w, -d);
  shape.lineTo(w, d);
  shape.lineTo(w - flange, d);
  shape.lineTo(w - flange, d - inset);
  shape.lineTo(-w + flange, d - inset);
  shape.lineTo(-w + flange, d);
  shape.lineTo(-w, d);
  shape.closePath();
  const geometry = extrude(shape, height, 0);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function buildStationFloor(root: THREE.Group, kit: MenuModelKit) {
  const stationFloor = part(root, 'station-floor', [0, FLOOR_Y, 0]);
  const floor = kit.batch(stationFloor, 'foreground-floor');
  floor.add(new THREE.BoxGeometry(18, 0.12, 18), 'plasterShade', [0, -0.062, -2]);
  for (let x = -6; x < 6; x += 0.75)
    for (let z = -6; z < 5.25; z += 0.75)
      floor.add(menuBox(0.747, 0.12, 0.747, 0.003), 'stone', [x + 0.375, -0.06, z + 0.375]);
  floor.flush();
  return stationFloor;
}

function buildPlatform(root: THREE.Group, kit: MenuModelKit) {
  const railwayRoot = new THREE.Group();
  railwayRoot.name = 'railway-layout-root';
  railwayRoot.position.set(2.75, RAIL_Y, -3.1);
  root.add(railwayRoot);
  const trackRoot = new THREE.Group();
  trackRoot.name = 'station-track';
  trackRoot.rotation.y = -0.65;
  railwayRoot.add(trackRoot);
  const batch = kit.batch(trackRoot, 'platform-and-track');
  batch.add(menuBox(0.66, 0.2, 9), 'stone', [-0.98, -0.15, -3]);
  for (let z = -7.125; z < 1.1; z += 0.75)
    batch.add(menuBox(0.68, 0.035, 0.745, 0.006), 'cream', [-0.98, -0.0675, z]);
  batch.add(menuBox(1.3, 0.12, 9), 'stone', [0, -0.19, -3]);
  for (let z = -7.3; z < 1.1; z += 0.42) {
    batch.add(menuBox(1.3, 0.06, 0.13, 0.005), 'woodDark', [0, -0.1, z]);
    for (const x of [-0.41, 0.41])
      batch.add(new THREE.BoxGeometry(0.09, 0.008, 0.11), 'iron', [x, -0.066, z]);
  }
  for (const x of [-0.41, 0.41]) {
    batch.add(menuBox(0.075, 0.013, 9, 0.003), 'iron', [x, -0.0635, -3]);
    batch.add(menuBox(0.04, 0.07, 9), 'iron', [x, -0.035, -3]);
  }
  for (let i = 0; i < 130; i++) {
    const x = Math.sin(i * 17.31) * 0.59,
      z = -7.4 + ((i * 0.173) % 8.8);
    const r = 0.018 + (i % 4) * 0.004;
    batch.add(new THREE.IcosahedronGeometry(r, 0), 'stone', [x, -0.133, z]);
  }
  batch.flush();
  return { railwayRoot, platform: trackRoot };
}

function buildLuggage(root: THREE.Group, kit: MenuModelKit, stickers?: THREE.Texture) {
  const cases = [
    {
      name: 'luggage-left-back',
      color: 'wood' as const,
      size: [0.72, 0.63, 0.34] as const,
      x: -2.4,
      z: 2.1,
      yaw: 0.13,
    },
    {
      name: 'luggage-left-front',
      color: 'wood' as const,
      size: [1.0, 0.55, 0.38] as const,
      x: -1.85,
      z: 2.6,
      yaw: -0.06,
    },
    {
      name: 'luggage-left-low',
      color: 'green' as const,
      size: [0.63, 0.39, 0.3] as const,
      x: -1.52,
      z: 2.06,
      yaw: 0.08,
    },
    {
      name: 'luggage-right',
      color: 'wood' as const,
      size: [0.9, 0.55, 0.34] as const,
      x: 2.15,
      z: 1.2,
      yaw: -0.2,
    },
  ];
  return cases.map(({ name, color, size, x, z, yaw }) => {
    const suitcase = buildMenuSuitcase(kit, color, stickers, { size });
    suitcase.name = name;
    suitcase.position.set(x, FLOOR_Y, z);
    suitcase.rotation.y = yaw;
    root.add(suitcase);
    kit.consolidate(suitcase, []);
    return suitcase;
  });
}

function buildBackdrop(root: THREE.Group, kit: MenuModelKit) {
  const backdropRoot = part(root, 'distant-backdrop');
  const batch = kit.batch(backdropRoot, 'distant-backdrop');
  batch.add(menuBox(24, 14, 0.1), 'sky', [3, 2, -13]);
  let seed = 81291;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Branch-supported, offset crowns leave sky gaps and an uneven skyline.
  for (const [x, y, z, spread, height] of [
    [0.3, 2.3, -11.3, 0.95, 1.1],
    [2.0, 2.65, -11.8, 1.3, 1.35],
    [3.9, 2.55, -11.4, 1.1, 1.4],
    [5.85, 1.9, -11.6, 0.8, 0.95],
    [7.1, 2.15, -11.2, 0.85, 1.2],
    [8.65, 2.2, -12.0, 1.35, 1.05],
  ]) {
    const trunk = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, FLOOR_Y, z),
      new THREE.Vector3(x - 0.06 * spread, 0.1, z),
      new THREE.Vector3(x + 0.09 * spread, y - height * 0.6, z + 0.05),
      new THREE.Vector3(x + 0.04 * spread, y + 0.15 * height, z - 0.06),
    ]);
    batch.add(new THREE.TubeGeometry(trunk, 12, 0.08 * spread, 7, false), 'woodDark');
    for (const [dx, dy, dz] of [
      [-0.55, 0.06, 0.12],
      [0.28, 0.48, -0.12],
      [0.58, -0.18, 0.06],
    ]) {
      const end = new THREE.Vector3(x + dx * spread, y + dy * height, z + dz);
      const branch = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x + 0.04, y - height * 0.68, z),
        new THREE.Vector3(x + dx * spread * 0.5, y - height * 0.23, z + dz * 0.5),
        end,
      ]);
      batch.add(new THREE.TubeGeometry(branch, 8, 0.035 * spread, 6, false), 'woodDark');
      const count = 12 + Math.floor(random() * 7);
      for (let i = 0; i < count; i++) {
        const a = random() * Math.PI * 2;
        const b = Math.acos(2 * random() - 1);
        const dist = Math.cbrt(random());
        const size = spread * (0.2 + random() * 0.18);
        const geometry = new THREE.IcosahedronGeometry(size, 1);
        const positions = geometry.getAttribute('position');
        const phase = random() * Math.PI * 2;
        for (let index = 0; index < positions.count; index++) {
          const p = new THREE.Vector3().fromBufferAttribute(positions, index);
          const normal = p.clone().normalize();
          p.multiplyScalar(
            1 +
              0.16 * Math.sin(normal.x * 5 + normal.y * 3 + phase) +
              0.1 * Math.cos(normal.z * 7 - phase),
          );
          positions.setXYZ(index, p.x, p.y, p.z);
        }
        geometry.scale(0.75 + random() * 0.7, 0.55 + random() * 0.8, 0.6 + random() * 0.6);
        geometry.computeVertexNormals();
        const leafY = end.y + Math.cos(b) * dist * height * 0.45;
        batch.add(
          geometry,
          leafY > y + height * 0.2 ? 'foliageLight' : random() < 0.3 ? 'foliageDark' : 'foliage',
          [
            end.x + Math.sin(b) * Math.cos(a) * dist * spread * 0.58,
            leafY,
            end.z + Math.sin(b) * Math.sin(a) * dist * spread * 0.48,
          ],
          [random() * 0.8, random() * Math.PI, random() * 0.6],
        );
      }
    }
  }
  // Recessed bays, pitched roof volumes and a separate canopy break the golden wall.
  batch.add(menuBox(8.7, 0.16, 1.65), 'stone', [4.2, FLOOR_Y + 0.08, -10.2]);
  for (const [x, width, top, z] of [
    [1.4, 2.7, 1.52, -10.6],
    [3.98, 2.16, 1.72, -10.8],
    [6.55, 2.7, 1.45, -10.58],
  ]) {
    batch.add(menuBox(width, top - FLOOR_Y, 0.58), 'cream', [x, (top + FLOOR_Y) / 2, z]);
    batch.add(menuBox(width + 0.26, 0.12, 1.08), 'green', [x, top + 0.06, z + 0.08]);
    const roof = new THREE.Shape();
    roof.moveTo(-width / 2 - 0.13, 0);
    roof.lineTo(0, 0.28);
    roof.lineTo(width / 2 + 0.13, 0);
    roof.closePath();
    batch.add(extrude(roof, 1.08, 0), 'woodDark', [x, top + 0.12, z - 0.46]);
    batch.add(menuBox(width + 0.3, 0.065, 0.08), 'paper', [x, top, z + 0.65]);
    for (const side of [-1, 1])
      batch.add(menuBox(0.16, top - FLOOR_Y, 0.23), 'plasterShade', [
        x + side * (width / 2 - 0.08),
        (top + FLOOR_Y) / 2,
        z + 0.38,
      ]);
    for (let bay = 0; bay < 3; bay++) {
      const wx = x + (bay - 1) * width * 0.28;
      const door = bay === 1 && width < 2.5;
      const wh = door ? 1.7 : bay === 1 ? 0.9 : 1.05;
      const wy = door ? FLOOR_Y + wh / 2 + 0.16 : 0.45;
      const ww = door ? 0.54 : 0.45;
      batch.add(menuBox(ww + 0.16, wh + 0.14, 0.11), 'plasterShade', [wx, wy, z + 0.33]);
      batch.add(menuBox(ww + 0.08, wh + 0.07, 0.06), 'woodDark', [wx, wy, z + 0.4]);
      batch.add(menuBox(ww, wh, 0.024), door ? 'green' : bay === 0 ? 'glass' : 'glassWarm', [
        wx,
        wy,
        z + 0.439,
      ]);
      if (!door) {
        batch.add(menuBox(0.023, wh, 0.032), 'green', [wx, wy, z + 0.467]);
        batch.add(menuBox(ww, 0.025, 0.032), 'green', [wx, wy + wh * 0.12, z + 0.468]);
        batch.add(menuBox(ww + 0.18, 0.065, 0.18), 'cream', [wx, wy - wh / 2 - 0.05, z + 0.44]);
      }
    }
  }
  batch.add(menuBox(8.55, 0.105, 1.4), 'green', [4.05, 1.38, -9.65]);
  batch.add(menuBox(8.58, 0.095, 0.1), 'paper', [4.05, 1.29, -8.97]);
  batch.add(menuBox(8.5, 0.2, 0.08), 'woodDark', [4.05, 1.24, -9.25]);
  for (const x of [0.15, 1.62, 3.3, 5.2, 6.84, 8.0]) {
    batch.add(menuBox(0.09, 2.1, 0.09), 'green', [x, FLOOR_Y + 1.05, -9.25]);
    batch.add(menuBox(0.19, 0.16, 0.19), 'plasterShade', [x, FLOOR_Y + 0.16, -9.25]);
    for (const direction of [-1, 1])
      batch.add(
        menuBox(0.38, 0.06, 0.07),
        'green',
        [x + direction * 0.13, 1.03, -9.25],
        [0, 0, direction * 0.55],
      );
  }
  for (const [x, z] of [
    [2.0, -7.5],
    [7.0, -9.0],
  ]) {
    batch.add(new THREE.CylinderGeometry(0.036, 0.062, 1.65, 10), 'iron', [x, FLOOR_Y + 0.825, z]);
    batch.add(menuBox(0.2, 0.04, 0.2), 'iron', [x, FLOOR_Y + 1.64, z]);
    batch.add(menuBox(0.15, 0.23, 0.15, 0.015), 'warm', [x, FLOOR_Y + 1.765, z]);
    for (const dx of [-0.09, 0.09])
      for (const dz of [-0.09, 0.09])
        batch.add(menuBox(0.015, 0.27, 0.015), 'iron', [x + dx, FLOOR_Y + 1.765, z + dz]);
    batch.add(
      new THREE.ConeGeometry(0.16, 0.12, 4),
      'iron',
      [x, FLOOR_Y + 1.96, z],
      [0, Math.PI / 4, 0],
    );
    batch.add(menuBox(0.16, 0.1, 0.16), 'iron', [x, FLOOR_Y + 0.05, z]);
  }
  batch.flush();
  return backdropRoot;
}
