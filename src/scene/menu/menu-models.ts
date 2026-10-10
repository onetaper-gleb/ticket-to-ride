import * as THREE from 'three';
import { createMenuModelKit, menuAnchor, menuBox, type MenuModelKit } from './menu-model-utils';
import { buildMenuTrain } from './menu-train';
import {
  buildMenuBell,
  buildMenuClock,
  buildMenuLamp,
  buildMenuSuitcase,
  buildMenuTicketHolder,
} from './menu-props';

export type MenuModels = {
  root: THREE.Group;
  cashierAnchor: THREE.Object3D;
  railwayRoot: THREE.Group;
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
    settingsRoot: THREE.Group;
    readonly innerPlane: THREE.Mesh;
    readonly settingsPlane: THREE.Mesh;
    bounds: THREE.Box3;
    settingsBounds: THREE.Box3;
    setLayout(
      bounds: THREE.Box3,
      settingsBounds: THREE.Box3,
      border: number,
      settingsBorder: number,
    ): void;
  };
  dispose(): void;
};

const FLOOR_Y = -1.45;
const RAIL_Y = -0.65;

export type MenuEnvironmentArt = {
  clockFace?: THREE.Texture;
  luggageStickers?: THREE.Texture;
  wood?: THREE.Texture;
};

/** Independent station bundle. Contact plane is Y=0; front is +Z. */
export function buildMenuModels(art: MenuEnvironmentArt = {}): MenuModels {
  const kit = createMenuModelKit(art.wood);
  const root = new THREE.Group();
  root.name = 'Ticket office environment';
  buildFacade(root, kit);
  const railwayRoot = buildPlatform(root, kit);
  buildCanopy(root, kit);
  buildBackdrop(root, kit);

  const cashierAnchor = menuAnchor(root, 'cashierAnchor', [0, 0, 0.02]);
  const counter = {
    handRestLeft: menuAnchor(root, 'handRestLeft', [0.35, 0, 0.17]),
    handRestRight: menuAnchor(root, 'handRestRight', [-0.35, 0, 0.17]),
    bellAnchor: menuAnchor(root, 'bellAnchor', [0.76, 0, 0.18]),
    ticketTrayAnchor: menuAnchor(root, 'ticketTrayAnchor', [-0.7, 0, 0.12]),
  };
  counter.bellAnchor.add(buildMenuBell(kit));
  counter.ticketTrayAnchor.add(buildMenuTicketHolder(kit));

  const board = buildBoard(root, kit);
  const clock = buildMenuClock(kit, art.clockFace);
  clock.root.position.set(1.36, 1.3, -0.03);
  root.add(clock.root);
  for (const [x, y, z] of [
    [-1.75, 2.13, 0.38],
    [0, 1.72, -0.35],
  ]) {
    const lamp = buildMenuLamp(kit);
    lamp.position.set(x, y, z);
    root.add(lamp);
  }
  const train = buildMenuTrain(kit);
  train.root.position.set(0, 0, 0);
  train.root.rotation.y = -0.65;
  railwayRoot.add(train.root);
  for (const [index, color] of (['wood', 'green'] as const).entries()) {
    const suitcase = buildMenuSuitcase(kit, color, art.luggageStickers);
    suitcase.position.set(index ? 2.8 : -3.1, FLOOR_Y, -0.6);
    suitcase.rotation.y = index ? -0.22 : 0.16;
    root.add(suitcase);
  }
  kit.consolidate(root, [
    board.root,
    board.settingsRoot,
    root.getObjectByName('settings-hangers')!,
    railwayRoot,
    clock.root,
    root.getObjectByName('bell-button')!,
  ]);
  return { root, cashierAnchor, railwayRoot, counter, clock, train, board, dispose: kit.dispose };
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

function openingPath() {
  const hole = new THREE.Path();
  hole.moveTo(-0.75, -0.08);
  hole.lineTo(-0.75, 1.42);
  hole.quadraticCurveTo(0, 1.94, 0.75, 1.42);
  hole.lineTo(0.75, -0.08);
  hole.closePath();
  return hole;
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

function buildFacade(root: THREE.Group, kit: MenuModelKit) {
  const batch = kit.batch(root, 'facade-and-counter');
  const wall = new THREE.Shape();
  wall.moveTo(-4.8, FLOOR_Y);
  wall.lineTo(1.03, FLOOR_Y);
  wall.lineTo(1.03, 2.6);
  wall.lineTo(-4.8, 2.6);
  wall.closePath();
  wall.holes.push(openingPath());
  batch.add(extrude(wall, 0.27), 'cream', [0, 0, -0.34]);
  batch.add(menuBox(5.83, 0.28, 0.34), 'green', [-1.885, FLOOR_Y + 0.14, -0.15]);
  batch.add(menuBox(1.78, 1.3, 0.25), 'green', [0, -0.74, -0.01]);
  batch.add(menuBox(1.45, 0.91, 0.05), 'woodDark', [0, -0.73, 0.13]);
  batch.add(menuBox(1.39, 0.85, 0.06), 'green', [0, -0.73, 0.165]);
  for (const x of [-0.84, 0.84]) {
    batch.add(verticalWood(menuBox(0.18, 1.53, 0.3)), 'wood', [x, 0.73, -0.1]);
    batch.add(menuBox(0.06, 1.53, 0.04), 'woodDark', [x + (x > 0 ? -0.04 : 0.04), 0.73, 0.07]);
  }
  const arch = new THREE.Shape();
  arch.moveTo(-0.99, 1.4);
  arch.quadraticCurveTo(0, 1.98, 0.99, 1.4);
  arch.lineTo(0.99, 1.66);
  arch.quadraticCurveTo(0, 2.25, -0.99, 1.66);
  arch.closePath();
  batch.add(extrude(arch, 0.32), 'wood', [0, 0, -0.23]);
  batch.add(menuBox(2.03, 0.13, 0.7, 0.04), 'wood', [0, -0.065, 0.04]);
  batch.add(menuBox(1.97, 0.035, 0.035), 'woodDark', [0, -0.09, 0.39]);
  batch.add(menuBox(1.59, 1.63, 0.05), 'woodDark', [0, 0.73, -0.91]);
  for (const x of [-0.55, 0.55])
    batch.add(verticalWood(menuBox(0.035, 1.49, 0.035)), 'wood', [x, 0.73, -0.87]);
  batch.flush();
}

function buildBoard(root: THREE.Group, kit: MenuModelKit): MenuModels['board'] {
  const boardRoot = new THREE.Group();
  boardRoot.name = 'boardFrame';
  root.add(boardRoot);
  const settingsRoot = new THREE.Group();
  settingsRoot.name = 'settingsFrame';
  root.add(settingsRoot);
  const hangersRoot = new THREE.Group();
  hangersRoot.name = 'settings-hangers';
  root.add(hangersRoot);
  const bounds = new THREE.Box3();
  const settingsBounds = new THREE.Box3();
  let innerPlane: THREE.Mesh;
  let settingsPlane: THREE.Mesh;
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
    bounds.min.z = bounds.max.z - 0.04;
    settingsBounds.min.z = settingsBounds.max.z - 0.04;
    kit.clearMeshes(boardRoot);
    kit.clearMeshes(settingsRoot);
    kit.clearMeshes(hangersRoot);
    nextBounds.getCenter(boardRoot.position);
    nextSettings.getCenter(settingsRoot.position);
    boardRoot.position.z = nextBounds.max.z;
    settingsRoot.position.z = nextSettings.max.z;
    hangersRoot.position.copy(settingsRoot.position);
    const pixel = border / 12;
    const settingsPixel = settingsBorder / 6;
    const batch = kit.batch(boardRoot, 'board-frame');
    batch.add(
      extrude(frameShape(size.x, size.y, border, pixel * 8, pixel * 3), 0.035, 0),
      'green',
      [0, 0, -0.04],
    );
    batch.add(
      new THREE.ShapeGeometry(
        frameShape(
          size.x - 2 * border + 2 * pixel,
          size.y - 2 * border + 2 * pixel,
          pixel,
          pixel * 4,
          pixel * 3,
        ),
        4,
      ),
      'brass',
      [0, 0, -0.001],
    );
    innerPlane = kit.mesh(
      boardRoot,
      new THREE.ShapeGeometry(roundedPanel(size.x - 2 * border, size.y - 2 * border, pixel * 3), 4),
      'green',
      'boardInnerPlane',
    );
    for (const x of [-size.x / 2 + border * 0.5, size.x / 2 - border * 0.5])
      for (const y of [-size.y / 2 + border * 0.5, size.y / 2 - border * 0.5]) {
        const rivet = new THREE.SphereGeometry(pixel * 4.5, 8, 6);
        rivet.scale(1, 1, 0.006 / (pixel * 4.5));
        batch.add(rivet, 'brass', [x, y, -0.006]);
      }
    batch.flush();
    const settings = kit.batch(settingsRoot, 'settings-frame');
    settings.add(
      extrude(
        frameShape(
          settingsSize.x,
          settingsSize.y,
          settingsBorder,
          settingsPixel * 8,
          settingsPixel * 3,
        ),
        0.04,
        0,
      ),
      'wood',
      [0, 0, -0.04],
    );
    const hangers = kit.batch(hangersRoot, 'settings-hangers');
    for (const x of [-settingsSize.x * 0.4, settingsSize.x * 0.4]) {
      hangers.add(new THREE.TorusGeometry(0.028, 0.008, 5, 10), 'brass', [
        x,
        settingsSize.y / 2 + 0.1,
        -0.02,
      ]);
      hangers.add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), 'brass', [
        x,
        settingsSize.y / 2 + 0.05,
        -0.02,
      ]);
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
    new THREE.Box3(new THREE.Vector3(-3.3, -0.55, 0.251), new THREE.Vector3(-1.0, 1.936, 0.251)),
    new THREE.Box3(new THREE.Vector3(-3.23, -1.03, 0.251), new THREE.Vector3(-1.07, -0.68, 0.251)),
    0.066,
    0.033,
  );
  return {
    root: boardRoot,
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
  };
}

function buildCanopy(root: THREE.Group, kit: MenuModelKit) {
  const batch = kit.batch(root, 'canopy');
  batch.add(menuBox(9.5, 0.2, 3.6), 'green', [0, 2.63, -1.0]);
  batch.add(menuBox(9.5, 0.17, 0.2), 'cream', [0, 2.46, 0.73]);
  const scallop = new THREE.Shape();
  scallop.moveTo(-0.17, 0);
  scallop.lineTo(0.17, 0);
  scallop.lineTo(0.17, -0.035);
  scallop.quadraticCurveTo(0.16, -0.19, 0, -0.19);
  scallop.quadraticCurveTo(-0.16, -0.19, -0.17, -0.035);
  scallop.closePath();
  for (let x = -4.65; x < 4.8; x += 0.34)
    batch.add(extrude(scallop, 0.06, 0), 'cream', [x, 2.42, 0.7]);
  batch.add(new THREE.CylinderGeometry(0.019, 0.019, 0.4, 8), 'iron', [-1.75, 2.33, 0.38]);
  for (const x of [1.16, 4.35]) {
    batch.add(menuBox(0.17, 4.02, 0.22), 'green', [x, 0.56, -0.2]);
    batch.add(menuBox(0.28, 0.22, 0.31), 'green', [x, FLOOR_Y + 0.11, -0.2]);
    batch.add(menuBox(0.24, 0.09, 0.28), 'cream', [x, -0.05, -0.2]);
    batch.add(menuBox(0.13, 0.68, 0.14), 'green', [x + 0.23, 2.31, -0.2], [0, 0, -0.66]);
  }
  for (const z of [-0.1, -1.45, -2.6]) batch.add(menuBox(9.1, 0.08, 0.08), 'wood', [0, 2.5, z]);
  batch.flush();
}

function buildPlatform(root: THREE.Group, kit: MenuModelKit) {
  const floor = kit.batch(root, 'foreground-floor');
  floor.add(menuBox(18, 0.12, 18), 'stone', [0, FLOOR_Y - 0.06, -2]);
  for (let x = -4.5; x < 4.5; x += 0.75)
    floor.add(new THREE.BoxGeometry(0.012, 0.004, 4), 'cream', [x, FLOOR_Y + 0.004, 0.4]);
  floor.flush();
  const railwayRoot = new THREE.Group();
  railwayRoot.name = 'railway-layout-root';
  railwayRoot.position.set(2.75, RAIL_Y, -3.1);
  root.add(railwayRoot);
  const trackRoot = new THREE.Group();
  trackRoot.name = 'station-track';
  trackRoot.rotation.y = -0.65;
  railwayRoot.add(trackRoot);
  const batch = kit.batch(trackRoot, 'platform-and-track');
  batch.add(menuBox(1.2, 0.7, 9), 'cream', [-1.3, -0.45, -3]);
  batch.add(menuBox(1.3, 0.7, 9), 'stone', [0, -0.45, -3]);
  for (let z = -7.3; z < 1.1; z += 0.42)
    batch.add(new THREE.BoxGeometry(1.3, 0.06, 0.13), 'woodDark', [0, -0.1, z]);
  for (const x of [-0.41, 0.41]) batch.add(menuBox(0.04, 0.07, 9), 'iron', [x, -0.035, -3]);
  batch.flush();
  return railwayRoot;
}

function buildBackdrop(root: THREE.Group, kit: MenuModelKit) {
  const batch = kit.batch(root, 'distant-backdrop');
  batch.add(menuBox(20, 12, 0.1), 'sky', [3, 2, -11]);
  for (const [x, y, radius] of [
    [1.4, 0.6, 0.9],
    [3.6, 1.1, 1.25],
    [6.1, 0.5, 1.0],
  ]) {
    batch.add(new THREE.IcosahedronGeometry(radius * 0.76, 1), 'foliage', [x, y, -9.1]);
    batch.add(new THREE.IcosahedronGeometry(radius * 0.57, 1), 'foliage', [
      x - radius * 0.65,
      y - radius * 0.13,
      -9.0,
    ]);
    batch.add(new THREE.IcosahedronGeometry(radius * 0.57, 1), 'foliage', [
      x + radius * 0.59,
      y + radius * 0.05,
      -9.05,
    ]);
    batch.add(new THREE.CylinderGeometry(0.1, 0.16, 1.8, 6), 'woodDark', [x, -0.5, -9.1]);
  }
  batch.add(menuBox(7, 1.4, 0.3), 'cream', [4, -0.75, -10]);
  batch.add(menuBox(7.3, 0.2, 0.6), 'woodDark', [4, 0.0, -10]);
  batch.flush();
}
