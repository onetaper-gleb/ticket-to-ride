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
  const root = new THREE.Group();
  root.name = 'Ticket office environment';
  const stationRoot = part(root, 'station-root');
  const { lowerFacade, interior } = buildFacade(stationRoot, kit);
  const stationFloor = buildStationFloor(root, kit);
  const { railwayRoot, platform } = buildPlatform(root, kit);
  const { canopy, supports, outerCanopySupport } = buildCanopy(stationRoot, kit);
  const backdropRoot = buildBackdrop(root, kit);

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
    [0, 1.68, -0.55],
  ].entries()) {
    const lamp = buildMenuLamp(kit, { compact: index === 1, stemExtension: index === 0 ? 0.2 : 0 });
    lamp.name = index === 0 ? 'lamp-board' : 'lamp-window';
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
  kit.consolidate(root, [stationRoot, stationFloor, railwayRoot, backdropRoot, ...luggage]);
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

function buildFacade(root: THREE.Group, kit: MenuModelKit) {
  const batch = kit.batch(root, 'facade-and-counter');
  const wall = new THREE.Shape();
  wall.moveTo(-4.8, -0.08);
  wall.lineTo(-0.75, -0.08);
  wall.lineTo(-0.75, 1.42);
  wall.quadraticCurveTo(0, 1.94, 0.75, 1.42);
  wall.lineTo(0.75, -0.08);
  wall.lineTo(1.03, -0.08);
  wall.lineTo(1.03, 2.6);
  wall.lineTo(-4.8, 2.6);
  wall.closePath();
  batch.add(extrude(wall, 0.27, 0), 'cream', [0, 0, -0.34]);
  const lowerFacade = part(root, 'lower-facade', [0, FLOOR_Y, 0]);
  const lower = kit.batch(lowerFacade, 'lower-facade');
  lower.add(menuBox(5.83, -0.08 - FLOOR_Y, 0.27), 'cream', [-1.885, (-0.08 - FLOOR_Y) / 2, -0.205]);
  lower.add(menuBox(5.83, 0.16, 0.34), 'green', [-1.885, 0.08, -0.15]);
  lower.add(menuBox(1.78, -0.13 - FLOOR_Y, 0.25), 'green', [0, (-0.13 - FLOOR_Y) / 2, -0.01]);
  lower.add(menuBox(1.45, 0.57, 0.05), 'woodDark', [0, 0.37, 0.13]);
  lower.add(menuBox(1.39, 0.51, 0.06), 'green', [0, 0.37, 0.165]);
  lower.flush();
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
  batch.flush();
  const interior = buildInterior(root, kit);
  return { lowerFacade, interior };
}

function buildInterior(root: THREE.Group, kit: MenuModelKit) {
  const interior = part(root, 'cashier-interior', [0, 0, -0.94]);
  const batch = kit.batch(interior, 'cashier-interior');
  batch.add(menuBox(1.59, 1.63, 0.05), 'woodDark', [0, 0.73, -0.02]);
  batch.add(menuBox(0.18, 0.07, 0.78), 'woodDark', [0, 1.715, 0.35]);
  batch.add(menuBox(0.12, 0.24, 0.09), 'woodDark', [0, 1.63, 0]);
  batch.add(extrude(roundedPanel(0.38, 0.9, 0.14), 0.018, 0), 'sky', [0.54, 0.98, 0.012]);
  for (const x of [0.32, 0.76])
    batch.add(verticalWood(menuBox(0.05, 1.0, 0.04)), 'wood', [x, 0.98, 0.04]);
  batch.add(menuBox(0.5, 0.045, 0.12), 'wood', [0.54, 0.51, 0.07]);
  for (const y of [0.38, 0.84, 1.3]) {
    batch.add(menuBox(0.61, 0.045, 0.21), 'wood', [-0.43, y, 0.09]);
    for (let index = 0; index < 3; index++) {
      const height = index === 1 ? 0.2 : 0.14;
      batch.add(menuBox(0.15, height, 0.12, 0.005), 'cream', [
        -0.64 + index * 0.19,
        y + 0.023 + height / 2,
        0.07,
      ]);
      batch.add(new THREE.BoxGeometry(0.15, 0.013, 0.003), 'woodDark', [
        -0.64 + index * 0.19,
        y + 0.08,
        0.132,
      ]);
    }
  }
  batch.add(verticalWood(menuBox(0.035, 1.49, 0.035)), 'wood', [-0.1, 0.73, 0.06]);
  batch.flush();
  return interior;
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
  settingsRoot.add(hangersRoot);
  const bounds = new THREE.Box3();
  const settingsBounds = new THREE.Box3();
  let innerPlane: THREE.Mesh;
  let settingsPlane: THREE.Mesh;
  let boardBorder = 0;
  let settingsFrameBorder = 0;
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
    kit.clearMeshes(boardRoot);
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
      'boardPaint',
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
    new THREE.Box3(new THREE.Vector3(-3.3, -0.27, 0.04), new THREE.Vector3(-1.0, 1.936, 0.04)),
    new THREE.Box3(new THREE.Vector3(-3.23, -0.75, 0.04), new THREE.Vector3(-1.07, -0.4, 0.04)),
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
  batch.add(menuBox(6.2, 0.18, 3.6), 'green', [4.05, 0, -1.0]);
  batch.add(menuBox(6.2, 0.17, 0.2), 'cream', [4.05, -0.17, 0.73]);
  batch.add(menuBox(6.3, 0.14, 0.16), 'iron', [0, -0.1, -0.14]);
  batch.add(menuBox(0.045, 0.04, 0.56), 'iron', [-2.0, -0.08, 0.1]);
  const scallop = new THREE.Shape();
  scallop.moveTo(-0.17, 0);
  scallop.lineTo(0.17, 0);
  scallop.lineTo(0.17, -0.035);
  scallop.quadraticCurveTo(0.16, -0.19, 0, -0.19);
  scallop.quadraticCurveTo(-0.16, -0.19, -0.17, -0.035);
  scallop.closePath();
  for (let x = 1.12; x < 7.15; x += 0.34)
    batch.add(extrude(scallop, 0.06, 0), 'cream', [x, -0.21, 0.7]);
  for (const z of [-0.1, -1.45, -2.6])
    batch.add(menuBox(6.1, 0.08, 0.08), 'wood', [4.05, -0.12, z]);
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
    const localX = x === 4.35 ? 0 : x;
    const localZ = x === 4.35 ? 0 : z;
    const height = 2.58 - FLOOR_Y;
    target.add(menuBox(0.17, height, 0.22), 'green', [localX, height / 2, localZ]);
    target.add(menuBox(0.28, 0.18, 0.31), 'green', [localX, 0.09, localZ]);
    target.add(menuBox(0.24, 0.09, 0.28), 'cream', [localX, -0.05 - FLOOR_Y, localZ]);
    target.add(menuBox(0.22, 0.08, 0.28), 'iron', [localX, 1.61 - FLOOR_Y, localZ]);
    target.add(
      menuBox(0.13, 0.68, 0.14),
      'green',
      [localX + 0.23, 2.31 - FLOOR_Y, localZ],
      [0, 0, -0.66],
    );
  }
  posts.flush();
  rightPost.flush();
  return { canopy, supports, outerCanopySupport };
}

function buildStationFloor(root: THREE.Group, kit: MenuModelKit) {
  const stationFloor = part(root, 'station-floor', [0, FLOOR_Y, 0]);
  const floor = kit.batch(stationFloor, 'foreground-floor');
  floor.add(menuBox(18, 0.12, 18), 'stone', [0, -0.06, -2]);
  for (let x = -4.5; x < 4.5; x += 0.75)
    floor.add(new THREE.BoxGeometry(0.008, 0.002, 6), 'cream', [x, 0.001, 1.2]);
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
  batch.add(menuBox(0.68, 0.035, 9), 'cream', [-0.98, -0.0675, -3]);
  batch.add(menuBox(1.3, 0.12, 9), 'stone', [0, -0.19, -3]);
  for (let z = -7.3; z < 1.1; z += 0.42)
    batch.add(new THREE.BoxGeometry(1.3, 0.06, 0.13), 'woodDark', [0, -0.1, z]);
  for (const x of [-0.41, 0.41]) batch.add(menuBox(0.04, 0.07, 9), 'iron', [x, -0.035, -3]);
  batch.flush();
  return { railwayRoot, platform: trackRoot };
}

function buildLuggage(root: THREE.Group, kit: MenuModelKit, stickers?: THREE.Texture) {
  const cases = [
    {
      name: 'luggage-left-back',
      color: 'wood' as const,
      size: [0.9, 0.5, 0.34] as const,
      x: -2.15,
      z: 1.9,
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
      size: [0.78, 0.46, 0.3] as const,
      x: -1.23,
      z: 2.06,
      yaw: 0.08,
    },
    {
      name: 'luggage-right',
      color: 'wood' as const,
      size: [0.9, 0.55, 0.34] as const,
      x: 1.95,
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
  return backdropRoot;
}
