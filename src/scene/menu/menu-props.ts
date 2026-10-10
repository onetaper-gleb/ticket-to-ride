import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { menuAnchor, menuBox, type MenuModelKit, type MenuPoint } from './menu-model-utils';

export interface MenuClock {
  root: THREE.Group;
  hourHand: THREE.Object3D;
  minuteHand: THREE.Object3D;
}

/** Clock origin is the dial centre; +Z faces the viewer. Both hand pivots bind to +Y. */
export function buildMenuClock(kit: MenuModelKit, clockFace?: THREE.Texture): MenuClock {
  const root = new THREE.Group();
  root.name = 'menu-clock';
  const frame = new THREE.Group();
  frame.name = 'hanging-frame';
  root.add(frame);
  const body = kit.batch(frame, 'clock-frame');
  body.add(
    new THREE.CylinderGeometry(0.32, 0.32, 0.14, 32),
    'iron',
    [0, 0, 0],
    [Math.PI / 2, 0, 0],
  );
  body.add(new THREE.TorusGeometry(0.296, 0.014, 6, 32), 'iron', [0, 0, 0.086]);
  body.add(menuBox(0.032, 0.85, 0.038, 0.008), 'iron', [-0.414, 0.18, -0.042]);
  body.add(menuBox(0.18, 0.032, 0.038, 0.008), 'iron', [-0.341, 0.54, -0.042]);
  body.add(menuBox(0.18, 0.032, 0.038, 0.008), 'iron', [-0.341, -0.236, -0.042]);
  body.add(menuBox(0.025, 0.185, 0.03, 0.008), 'iron', [-0.265, 0.458, -0.042]);
  body.add(menuBox(0.075, 0.12, 0.05, 0.012), 'iron', [-0.414, 0.482, -0.042]);
  body.add(menuBox(0.075, 0.12, 0.05, 0.012), 'iron', [-0.414, -0.212, -0.042]);
  for (let index = 0; !clockFace && index < 60; index += 1) {
    const angle = (index * Math.PI * 2) / 60;
    const major = index % 5 === 0;
    const radius = major ? 0.25 : 0.257;
    body.add(
      new THREE.BoxGeometry(major ? 0.012 : 0.005, major ? 0.037 : 0.019, 0.003),
      'iron',
      [Math.sin(angle) * radius, Math.cos(angle) * radius, 0.097],
      [0, 0, -angle],
    );
  }
  body.add(
    new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16),
    'iron',
    [0, 0, 0.139],
    [Math.PI / 2, 0, 0],
  );
  body.flush();
  const face = kit.mesh(
    root,
    new THREE.CylinderGeometry(0.284, 0.284, 0.014, 32),
    'paper',
    'clock-dial',
  );
  face.position.z = 0.087;
  face.rotation.x = Math.PI / 2;
  face.userData.artSlot = { id: 'A05', diameter: 0.568, normal: '+Z', centreZ: 0.094 };
  if (clockFace) {
    const print = kit.mappedMesh(
      root,
      new THREE.PlaneGeometry(0.568, 0.568),
      'paper',
      clockFace,
      'clock-print',
    );
    print.position.z = 0.099;
  }

  const hourHand = menuAnchor(root, 'hour-hand', [0, 0, 0.102]);
  const minuteHand = menuAnchor(root, 'minute-hand', [0, 0, 0.12]);
  kit.mesh(hourHand, clockHandGeometry(0.159, 0.022), 'iron', 'hour-hand-blade');
  kit.mesh(minuteHand, clockHandGeometry(0.225, 0.013), 'iron', 'minute-hand-blade');
  root.userData.artDependency = 'A05: pass clockFace at construction; geometric ticks are omitted';
  return { root, hourHand, minuteHand };
}

function clockHandGeometry(length: number, halfWidth: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth * 0.58, -0.042);
  shape.lineTo(halfWidth * 0.58, -0.042);
  shape.lineTo(halfWidth, length * 0.61);
  shape.lineTo(0, length);
  shape.lineTo(-halfWidth, length * 0.61);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.009, steps: 1, bevelEnabled: false });
}

export interface MenuLampOptions {
  /** Shallow ceiling fixture for the cashier window instead of the suspended shade. */
  compact?: boolean;
  /** Physical depth of a compact fixture; ceiling contact stays at Y=0. Default .175. */
  compactHeight?: number;
  /** Extra suspended stem length; the ceiling cap stays at Y=0. Incompatible with compact. */
  stemExtension?: number;
}

/** Origin is the ceiling contact; fixtures extend down -Y. No scene light. */
export function buildMenuLamp(kit: MenuModelKit, options: MenuLampOptions = {}): THREE.Group {
  const extension = options.stemExtension === undefined ? 0 : options.stemExtension;
  if (!Number.isFinite(extension) || extension < 0)
    throw new RangeError('Menu lamp stemExtension must be finite and non-negative');
  if (options.compact && extension !== 0)
    throw new RangeError('Compact menu lamp cannot have a stem extension');
  const compactHeight = options.compactHeight ?? 0.175;
  if (
    !Number.isFinite(compactHeight) ||
    compactHeight <= 0 ||
    (options.compactHeight !== undefined && !options.compact)
  )
    throw new RangeError(
      'Menu lamp compactHeight requires a compact fixture and a finite positive value',
    );
  const root = new THREE.Group();
  root.name = 'menu-lamp';
  const body = kit.batch(root, 'lamp');
  if (options.compact) {
    body.add(new THREE.CylinderGeometry(0.072, 0.072, 0.026, 16), 'iron', [0, -0.013, 0]);
    const profile = [
      [0.182, -0.16],
      [0.185, -0.151],
      [0.178, -0.125],
      [0.15, -0.08],
      [0.104, -0.045],
      [0.064, -0.027],
      [0.042, -0.021],
      [0.034, -0.03],
      [0.056, -0.037],
      [0.096, -0.055],
      [0.141, -0.09],
      [0.168, -0.135],
      [0.173, -0.151],
      [0.173, -0.16],
      [0.182, -0.16],
    ].map(([radius, height]) => new THREE.Vector2(radius, height));
    body.add(new THREE.LatheGeometry(profile, 40), 'iron');
    body.add(new THREE.CylinderGeometry(0.174, 0.174, 0.02, 32), 'warm', [0, -0.165, 0]);
    body.flush();
    if (compactHeight !== 0.175)
      root.traverse((node) => {
        if (node instanceof THREE.Mesh) node.geometry.scale(1, compactHeight / 0.175, 1);
      });
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    root.userData.contact = {
      plane: 'Y=0',
      direction: '-Y',
      height: size.y,
      diameter: Math.max(size.x, size.z),
      compact: true,
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    };
    return root;
  }
  body.add(new THREE.CylinderGeometry(0.057, 0.057, 0.025, 16), 'iron', [0, -0.0125, 0]);
  body.add(new THREE.CylinderGeometry(0.019, 0.019, 0.23 + extension, 12), 'iron', [
    0,
    -0.126 - extension / 2,
    0,
  ]);
  const shadeProfile = [
    [0.021, -0.225],
    [0.052, -0.24],
    [0.112, -0.272],
    [0.174, -0.318],
    [0.209, -0.371],
    [0.225, -0.406],
    [0.225, -0.421],
    [0.214, -0.421],
    [0.202, -0.376],
    [0.165, -0.325],
    [0.105, -0.28],
    [0.046, -0.25],
    [0.016, -0.24],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  // Lathe meridians run bottom-to-top so the outer shade retains outward normals.
  body.add(new THREE.LatheGeometry(shadeProfile.reverse(), 40), 'iron', [0, -extension, 0]);
  body.add(new THREE.CylinderGeometry(0.195, 0.195, 0.008, 32), 'warm', [0, -0.418 - extension, 0]);
  body.add(new THREE.SphereGeometry(0.066, 20, 12), 'warm', [0, -0.427 - extension, 0]);
  body.flush();
  root.userData.contact = {
    plane: 'Y=0',
    direction: '-Y',
    height: 0.493 + extension,
    diameter: 0.45,
  };
  return root;
}

/** Small decorative service bell. bell-button is a separate pivot, with no picking metadata. */
export function buildMenuBell(kit: MenuModelKit): THREE.Group {
  const root = new THREE.Group();
  root.name = 'menu-bell';
  const body = kit.batch(root, 'bell-body');
  body.add(new THREE.CylinderGeometry(0.104, 0.107, 0.022, 32), 'iron', [0, 0.011, 0]);
  body.add(new THREE.CylinderGeometry(0.096, 0.096, 0.013, 32), 'brass', [0, 0.027, 0]);
  body.add(
    new THREE.TorusGeometry(0.093, 0.006, 6, 32),
    'iron',
    [0, 0.036, 0],
    [Math.PI / 2, 0, 0],
  );
  const profile = [
    [0, 0.038],
    [0.088, 0.038],
    [0.089, 0.046],
    [0.084, 0.063],
    [0.072, 0.083],
    [0.05, 0.101],
    [0.021, 0.11],
    [0, 0.11],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  body.add(new THREE.LatheGeometry(profile, 32), 'brass');
  body.flush();
  const button = menuAnchor(root, 'bell-button', [0, 0.11, 0]);
  const buttonParts = kit.batch(button, 'bell-button');
  buttonParts.add(new THREE.CylinderGeometry(0.011, 0.011, 0.015, 16), 'brass', [0, 0.0075, 0]);
  const buttonCap = new THREE.SphereGeometry(0.022, 12, 6);
  buttonCap.scale(1, 0.35, 1);
  buttonParts.add(buttonCap, 'brass', [0, 0.016, 0]);
  buttonParts.flush();
  root.userData.contact = { plane: 'Y=0', diameter: 0.214, height: 0.134 };
  return root;
}

/** Empty ticket bin; M07 paper is owned by the cashier bundle. Origin rests on counter Y=0. */
export function buildMenuTicketHolder(kit: MenuModelKit): THREE.Group {
  const root = new THREE.Group();
  root.name = 'menu-ticket-holder';
  const body = kit.batch(root, 'ticket-holder');
  body.add(menuBox(0.18, 0.025, 0.13, 0.006), 'iron', [0, 0.0125, 0]);
  body.add(menuBox(0.18, 0.09, 0.022, 0.006), 'iron', [0, 0.06, 0.054]);
  body.add(menuBox(0.18, 0.14, 0.022, 0.006), 'iron', [0, 0.07, -0.054]);
  body.add(menuBox(0.02, 0.115, 0.106, 0.005), 'iron', [-0.08, 0.0675, 0]);
  body.add(menuBox(0.02, 0.115, 0.106, 0.005), 'iron', [0.08, 0.0675, 0]);
  body.flush();
  menuAnchor(root, 'ticket-slot', [0, 0.026, 0]);
  root.userData.ticketSlot = {
    name: 'ticket-slot',
    width: 0.14,
    depth: 0.086,
    normal: '+Z',
    innerBounds: { min: [-0.07, 0.025, -0.043], max: [0.07, 0.14, 0.043] },
    edgeHeights: { front: 0.105, sides: 0.125, back: 0.14 },
    neutralFoot: [0, 0.026, 0],
  };
  return root;
}

/** Cast-iron bench: Y=0 floor, +Z front. About 1.25 wide / 1.0 high / .67 deep. */
export function buildMenuBench(kit: MenuModelKit): THREE.Group {
  const root = new THREE.Group();
  root.name = 'menu-bench';
  const body = kit.batch(root, 'bench');
  for (const z of [-0.05, 0.1, 0.25])
    body.add(new RoundedBoxGeometry(1.25, 0.054, 0.13, 2, 0.012), 'wood', [0, 0.42, z]);
  for (const [y, z] of [
    [0.76, -0.25],
    [0.94, -0.31],
  ])
    body.add(new RoundedBoxGeometry(1.2, 0.108, 0.055, 2, 0.012), 'wood', [0, y, z], [-0.18, 0, 0]);
  for (const x of [-0.535, 0.535]) {
    body.add(
      menuTube(
        [
          [x, 0.035, 0.25],
          [x, 0.17, 0.225],
          [x, 0.34, 0.155],
          [x, 0.41, 0.2],
        ],
        0.026,
        18,
      ),
      'iron',
    );
    body.add(
      menuTube(
        [
          [x, 0.035, -0.22],
          [x, 0.2, -0.11],
          [x, 0.42, -0.1],
          [x, 0.55, -0.19],
          [x, 0.94, -0.315],
        ],
        0.026,
        22,
      ),
      'iron',
    );
    body.add(
      menuTube(
        [
          [x, 0.61, -0.215],
          [x, 0.63, -0.025],
          [x, 0.59, 0.2],
          [x, 0.54, 0.265],
          [x, 0.42, 0.25],
        ],
        0.022,
        22,
      ),
      'iron',
    );
    body.add(menuBox(0.055, 0.035, 0.45, 0.008), 'iron', [x, 0.389, 0.095]);
    for (const z of [-0.22, 0.25])
      body.add(menuBox(0.09, 0.018, 0.1, 0.006), 'iron', [x, 0.009, z]);
    for (const [y, z] of [
      [0.76, -0.22],
      [0.94, -0.28],
    ])
      body.add(
        new THREE.CylinderGeometry(0.009, 0.009, 0.009, 10),
        'iron',
        [x, y, z],
        [Math.PI / 2, 0, 0],
      );
  }
  for (const z of [-0.1, 0.2])
    body.add(
      new THREE.CylinderGeometry(0.024, 0.024, 1.07, 12),
      'iron',
      [0, 0.395, z],
      [0, 0, Math.PI / 2],
    );
  body.flush();
  root.userData.contact = menuFloorContact(root);
  root.userData.seatPlaneY = 0.447;
  return root;
}

/** Empty four-wheel luggage trolley: Y=0 floor, +Z front; rear handle is at -Z. */
export function buildMenuLuggageTrolley(kit: MenuModelKit): THREE.Group {
  const root = new THREE.Group();
  root.name = 'menu-luggage-trolley';
  const body = kit.batch(root, 'luggage-trolley');
  body.add(
    menuTube(
      [
        [-0.22, 0.145, -0.27],
        [0.22, 0.145, -0.27],
        [0.22, 0.145, 0.27],
        [-0.22, 0.145, 0.27],
      ],
      0.014,
      36,
      true,
    ),
    'iron',
  );
  for (const x of [-0.2, -0.065, 0.065, 0.2])
    body.add(
      new THREE.CylinderGeometry(0.012, 0.012, 0.5, 12),
      'iron',
      [x, 0.145, 0],
      [Math.PI / 2, 0, 0],
    );
  const tireProfile = [
    [0, -0.02],
    [0.049, -0.02],
    [0.06, -0.015],
    [0.067, -0.008],
    [0.067, 0.008],
    [0.06, 0.015],
    [0.049, 0.02],
    [0, 0.02],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  for (const z of [-0.21, 0.21]) {
    body.add(
      new THREE.CylinderGeometry(0.011, 0.011, 0.44, 12),
      'iron',
      [0, 0.067, z],
      [0, 0, -Math.PI / 2],
    );
    for (const x of [-0.22, 0.22]) {
      body.add(
        new THREE.LatheGeometry(tireProfile, 24),
        'iron',
        [x, 0.067, z],
        [0, 0, -Math.PI / 2],
      );
      body.add(new THREE.CylinderGeometry(0.013, 0.013, 0.1, 12), 'iron', [x, 0.108, z]);
      body.add(
        new THREE.CylinderGeometry(0.023, 0.023, 0.009, 16),
        'iron',
        [x + Math.sign(x) * 0.024, 0.067, z],
        [0, 0, -Math.PI / 2],
      );
    }
  }
  body.add(
    menuTube(
      [
        [-0.21, 0.145, -0.265],
        [-0.21, 0.42, -0.285],
        [-0.185, 0.475, -0.25],
        [0.185, 0.475, -0.25],
        [0.21, 0.42, -0.285],
        [0.21, 0.145, -0.265],
      ],
      0.016,
      40,
    ),
    'iron',
  );
  body.flush();
  root.userData.contact = menuFloorContact(root);
  root.userData.luggageBed = {
    planeY: 0.159,
    min: [-0.205, 0.159, -0.23],
    max: [0.205, 0.159, 0.23],
  };
  root.userData.wheelAxis = '+X';
  return root;
}

export interface MenuSemaphore {
  root: THREE.Group;
  armPivot: THREE.Object3D;
}

export interface MenuSemaphoreOptions {
  /** Overall floor-to-finial height; fittings follow this dimension. Default 3.4. */
  height?: number;
  /** Full red arm length, including the short overlap behind its pivot. Default .9. */
  armLength?: number;
}

/** Y=0 floor, +Z front. Static arm binds toward +X; pivot rotates around local +Z. */
export function buildMenuSemaphore(
  kit: MenuModelKit,
  options: MenuSemaphoreOptions = {},
): MenuSemaphore {
  const height = options.height ?? 3.4;
  const armLength = options.armLength ?? 0.9;
  if (![height, armLength].every((value) => Number.isFinite(value) && value > 0))
    throw new RangeError('Menu semaphore height and armLength must be finite and positive');
  const f = height / 1.487;
  const at = (x: number, y: number, z: number): MenuPoint => [x * f, y * f, z * f];
  const root = new THREE.Group();
  root.name = 'menu-semaphore';
  const body = kit.batch(root, 'semaphore');
  body.add(menuBox(0.16 * f, 0.05 * f, 0.16 * f, 0.012 * f), 'iron', at(0, 0.025, 0));
  body.add(new THREE.CylinderGeometry(0.023 * f, 0.027 * f, 1.36 * f, 20), 'iron', at(0, 0.71, 0));
  body.add(new THREE.SphereGeometry(0.057 * f, 20, 12), 'red', at(0, 1.43, 0));
  body.add(menuBox(0.065 * f, 0.18 * f, 0.095 * f, 0.01 * f), 'iron', at(0, 1.1, 0.026));
  body.add(
    new THREE.CylinderGeometry(0.083 * f, 0.083 * f, 0.04 * f, 24),
    'iron',
    at(0, 1.08, 0.07),
    [Math.PI / 2, 0, 0],
  );
  body.add(
    new THREE.CylinderGeometry(0.037 * f, 0.037 * f, 0.014 * f, 24),
    'glassWarm',
    at(0, 1.08, 0.096),
    [Math.PI / 2, 0, 0],
  );
  body.add(
    new THREE.CylinderGeometry(0.025 * f, 0.025 * f, 0.085 * f, 20),
    'iron',
    at(0, 1.26, 0.0275),
    [Math.PI / 2, 0, 0],
  );
  body.flush();
  const pivotPosition = at(0, 1.26, 0.047);
  const armPivot = menuAnchor(root, 'semaphore-arm-pivot', pivotPosition);
  const arm = kit.batch(armPivot, 'semaphore-arm');
  arm.add(menuBox(armLength, 0.095 * f, 0.027 * f, 0.009 * Math.min(f, armLength / 0.55)), 'red', [
    (0.245 / 0.55) * armLength,
    0,
    0,
  ]);
  for (const z of [-0.015, 0.015])
    arm.add(new THREE.BoxGeometry((0.074 / 0.55) * armLength, 0.097 * f, 0.004 * f), 'paper', [
      (0.424 / 0.55) * armLength,
      0,
      z * f,
    ]);
  arm.flush();
  root.userData.contact = menuFloorContact(root);
  root.userData.armBind = {
    pivot: pivotPosition,
    rotation: [0, 0, 0],
    direction: '+X',
    axis: '+Z',
  };
  root.userData.semaphoreSize = { height, armLength };
  return { root, armPivot };
}

function menuTube(points: readonly MenuPoint[], radius: number, segments: number, closed = false) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(...point)),
    closed,
    'catmullrom',
    0.15,
  );
  return new THREE.TubeGeometry(curve, segments, radius, 8, closed);
}

function menuFloorContact(root: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  return {
    plane: 'Y=0',
    front: '+Z',
    width: size.x,
    height: size.y,
    depth: size.z,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  };
}

export interface MenuSuitcaseOptions {
  /** Body dimensions excluding feet/fittings/handle; front must fit a square 30%-width decal. */
  size?: readonly [width: number, height: number, depth: number];
}

/** Author-made case; Y=0 is the floor. Resizes geometry while root scale stays identity. */
export function buildMenuSuitcase(
  kit: MenuModelKit,
  color: 'wood' | 'green',
  stickers?: THREE.Texture,
  options: MenuSuitcaseOptions = {},
): THREE.Group {
  const [width, height, depth] = options.size ?? [0.7, 0.43, 0.26];
  if (![width, height, depth].every((dimension) => Number.isFinite(dimension) && dimension > 0))
    throw new RangeError('Menu suitcase dimensions must be finite and positive');
  const sx = width / 0.7;
  const sy = height / 0.43;
  const sz = depth / 0.26;
  const bevelScale = Math.min(sx, sy, sz);
  const radius = Math.min(0.044 * bevelScale, width / 3, height / 3, depth / 3);
  const footHeight = 0.025 * sy;
  const decalSize = width * 0.3;
  const decalMinY = footHeight + radius + 0.004 * bevelScale;
  const decalMaxY = 0.32 * sy - 0.008 * bevelScale;
  if (decalMaxY - decalMinY < decalSize)
    throw new RangeError(
      'Menu suitcase height must leave room for a square 30%-width luggage decal',
    );
  const decalY = THREE.MathUtils.clamp(
    0.18 * sy,
    decalMinY + decalSize / 2,
    decalMaxY - decalSize / 2,
  );
  const at = (x: number, y: number, z: number): [number, number, number] => [
    x * sx,
    y * sy,
    z * sz,
  ];
  const box = (x: number, y: number, z: number, radius = 0) =>
    radius > 0
      ? menuBox(x * sx, y * sy, z * sz, radius * bevelScale)
      : new THREE.BoxGeometry(x * sx, y * sy, z * sz);
  const root = new THREE.Group();
  root.name = `menu-suitcase-${color}`;
  const body = kit.batch(root, 'suitcase');
  const shell = color === 'wood' ? 'leather' : 'green';
  const trim = color === 'wood' ? 'woodDark' : 'leather';
  const centreY = footHeight + height / 2;
  const topY = footHeight + height;
  body.add(new RoundedBoxGeometry(width, height, depth, 3, radius), shell, [0, centreY, 0]);
  body.add(suitcaseSeamGeometry(width, height, radius, 0.003 * bevelScale, 0.008 * sz), trim, [
    0,
    centreY,
    0,
  ]);
  body.add(
    menuTube(
      [
        [-0.084 * sx, topY + 0.005 * sy, 0],
        [-0.074 * sx, topY + 0.043 * sy, 0],
        [-0.051 * sx, topY + 0.054 * sy, 0],
        [0.051 * sx, topY + 0.054 * sy, 0],
        [0.074 * sx, topY + 0.043 * sy, 0],
        [0.084 * sx, topY + 0.005 * sy, 0],
      ],
      0.012 * bevelScale,
      24,
    ),
    trim,
  );
  for (const x of [-0.21, 0.21]) {
    body.add(
      suitcaseStrapGeometry(0.025 * sx, height, depth, radius, 0.0025 * bevelScale),
      'brass',
      [x * sx, centreY, 0],
    );
  }
  const corner = suitcaseCornerGeometry(radius, 0.006 * bevelScale, 0.0025 * bevelScale);
  for (const bottom of [false, true]) {
    for (let quarter = 0; quarter < 4; quarter += 1) {
      const rotation: [number, number, number] = [bottom ? Math.PI : 0, (quarter * Math.PI) / 2, 0];
      const direction = new THREE.Vector3(1, 1, 1).applyEuler(new THREE.Euler(...rotation));
      body.add(
        corner.clone(),
        'brass',
        [
          Math.sign(direction.x) * (width / 2 - radius),
          centreY + Math.sign(direction.y) * (height / 2 - radius),
          Math.sign(direction.z) * (depth / 2 - radius),
        ],
        rotation,
      );
    }
  }
  corner.dispose();
  for (const x of [-1, 1])
    for (const z of [-0.065, 0.065])
      body.add(box(0.04, 0.025, 0.03, 0.004), trim, [
        x * (width / 2 - radius - 0.025 * sx),
        footHeight / 2,
        z * sz,
      ]);
  for (const x of [-0.101, 0.101]) {
    body.add(box(0.039, 0.05, 0.003), 'brass', at(x, 0.345, 0.1305));
    body.add(box(0.021, 0.023, 0.006), 'brass', at(x, 0.349, 0.135));
    for (const y of [0.329, 0.361])
      body.add(
        new THREE.CylinderGeometry(0.004 * bevelScale, 0.004 * bevelScale, 0.003 * sz, 10),
        'brass',
        at(x, y, 0.135),
        [Math.PI / 2, 0, 0],
      );
  }
  for (const x of [-0.084, 0.084])
    body.add(box(0.05, 0.007, 0.039), 'brass', [x * sx, topY + 0.0015 * sy, 0]);
  body.flush();
  const frontDecal = menuAnchor(root, 'decal-front', [0, decalY, 0.131 * sz]);
  if (stickers) {
    const geometry = new THREE.PlaneGeometry(decalSize, decalSize);
    const uv = geometry.getAttribute('uv');
    const left = color === 'wood' ? 16 : 272;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (left + uv.getX(i) * 224) / 512, (272 + uv.getY(i) * 224) / 512);
    kit.mappedMesh(frontDecal, geometry, 'paper', stickers, 'luggage-print');
  }
  const sideDecal = menuAnchor(root, 'decal-side', at(0.351, 0.235, 0));
  sideDecal.rotation.y = Math.PI / 2;
  root.userData.decalSlots = [
    {
      name: 'decal-front',
      width: decalSize,
      height: decalSize,
      normal: '+Z',
      art: 'A07',
      clearance: {
        strap: 0.1975 * sx - decalSize / 2,
        lock: 0.32 * sy - decalY - decalSize / 2,
        lowerCurve: decalY - decalSize / 2 - footHeight - radius,
      },
    },
    { name: 'decal-side', width: 0.09 * sz, height: 0.09 * sz, normal: '+X', art: 'A07' },
  ];
  root.userData.bodySize = [width, height, depth];
  root.userData.bodyBounds = {
    min: [-width / 2, footHeight, -depth / 2],
    max: [width / 2, footHeight + height, depth / 2],
  };
  const bounds = new THREE.Box3().setFromObject(root);
  const actualSize = bounds.getSize(new THREE.Vector3());
  root.userData.contact = {
    plane: 'Y=0',
    width: actualSize.x,
    height: actualSize.y,
    depth: actualSize.z,
    footHeight,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  };
  return root;
}

/** Narrow closing seam; its inside edge enters the leather shell. */
function suitcaseSeamGeometry(
  width: number,
  height: number,
  radius: number,
  rim: number,
  depth: number,
) {
  const shape = new THREE.Shape();
  suitcaseRoundedPath(shape, width + rim, height + rim, radius + rim / 2);
  const hole = new THREE.Path();
  suitcaseRoundedPath(hole, width - rim * 2, height - rim * 2, radius - rim);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 5,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

type SuitcaseCapVertex = [number, number, number, number, number, number, number, number];

/** A thin, closed three-face cap wraps one body corner. Other corners use proper rotations. */
function suitcaseCornerGeometry(radius: number, flap: number, shell: number) {
  const extent = 2 * (radius + flap + shell);
  const source = new RoundedBoxGeometry(extent, extent, extent, 3, radius + shell);
  const rounded = source.index ? source.toNonIndexed() : source.clone();
  source.dispose();
  const position = rounded.getAttribute('position');
  const normal = rounded.getAttribute('normal');
  const uv = rounded.getAttribute('uv');
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const read = (index: number): SuitcaseCapVertex => [
    position.getX(index),
    position.getY(index),
    position.getZ(index),
    normal.getX(index),
    normal.getY(index),
    normal.getZ(index),
    uv.getX(index),
    uv.getY(index),
  ];
  const coat = (vertex: SuitcaseCapVertex, inside: boolean): SuitcaseCapVertex => {
    const n = new THREE.Vector3(vertex[3], vertex[4], vertex[5]).normalize();
    const offset = inside ? shell * 2.2 : 0;
    return [
      vertex[0] - flap - n.x * offset,
      vertex[1] - flap - n.y * offset,
      vertex[2] - flap - n.z * offset,
      n.x * (inside ? -1 : 1),
      n.y * (inside ? -1 : 1),
      n.z * (inside ? -1 : 1),
      vertex[6],
      vertex[7],
    ];
  };
  const triangle = (
    a: SuitcaseCapVertex,
    b: SuitcaseCapVertex,
    c: SuitcaseCapVertex,
    side = false,
  ) => {
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = ab.cross(ac);
    if (n.lengthSq() < 1e-18) return;
    n.normalize();
    for (const vertex of [a, b, c]) {
      positions.push(vertex[0], vertex[1], vertex[2]);
      normals.push(...(side ? [n.x, n.y, n.z] : vertex.slice(3, 6)));
      uvs.push(vertex[6], vertex[7]);
    }
  };
  for (let index = 0; index < position.count; index += 3) {
    let polygon = [read(index), read(index + 1), read(index + 2)];
    for (let axis = 0; axis < 3 && polygon.length; axis += 1) {
      const clipped: SuitcaseCapVertex[] = [];
      for (let edge = 0; edge < polygon.length; edge += 1) {
        const a = polygon[edge];
        const b = polygon[(edge + 1) % polygon.length];
        const aInside = a[axis] >= 0;
        const bInside = b[axis] >= 0;
        if (aInside) clipped.push(a);
        if (aInside !== bInside) {
          const t = a[axis] / (a[axis] - b[axis]);
          const crossing = a.map(
            (value, component) => value + (b[component] - value) * t,
          ) as SuitcaseCapVertex;
          crossing[axis] = 0;
          clipped.push(crossing);
        }
      }
      polygon = clipped;
    }
    if (polygon.length < 3) continue;
    const outer = polygon.map((vertex) => coat(vertex, false));
    const inner = polygon.map((vertex) => coat(vertex, true));
    for (let fan = 1; fan < polygon.length - 1; fan += 1) {
      triangle(outer[0], outer[fan], outer[fan + 1]);
      triangle(inner[0], inner[fan + 1], inner[fan]);
    }
    for (let edge = 0; edge < polygon.length; edge += 1) {
      const next = (edge + 1) % polygon.length;
      if (
        ![0, 1, 2].some(
          (axis) => Math.abs(polygon[edge][axis]) < 1e-9 && Math.abs(polygon[next][axis]) < 1e-9,
        )
      )
        continue;
      triangle(outer[edge], inner[edge], outer[next], true);
      triangle(outer[next], inner[edge], inner[next], true);
    }
  }
  rounded.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

/** Closed bands follow the body bevel; their inner rim enters it to cover faceted edges. */
function suitcaseStrapGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
  thickness: number,
) {
  const shape = new THREE.Shape();
  suitcaseRoundedPath(shape, depth + thickness * 2, height + thickness * 2, radius + thickness);
  const hole = new THREE.Path();
  suitcaseRoundedPath(hole, depth - thickness * 4, height - thickness * 4, radius - thickness * 2);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    steps: 1,
    curveSegments: 4,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

function suitcaseRoundedPath(path: THREE.Path, width: number, height: number, radius: number) {
  const x = width / 2;
  const y = height / 2;
  path.moveTo(-x + radius, -y);
  path.lineTo(x - radius, -y);
  path.absarc(x - radius, -y + radius, radius, -Math.PI / 2, 0, false);
  path.lineTo(x, y - radius);
  path.absarc(x - radius, y - radius, radius, 0, Math.PI / 2, false);
  path.lineTo(-x + radius, y);
  path.absarc(-x + radius, y - radius, radius, Math.PI / 2, Math.PI, false);
  path.lineTo(-x, -y + radius);
  path.absarc(-x + radius, -y + radius, radius, Math.PI, Math.PI * 1.5, false);
  path.closePath();
}
