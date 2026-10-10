import * as THREE from 'three';
import { menuAnchor, menuBox, type MenuModelKit } from './menu-model-utils';

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
    body.add(new THREE.LatheGeometry(profile, 24), 'iron');
    body.add(new THREE.CylinderGeometry(0.174, 0.174, 0.02, 24), 'warm', [0, -0.165, 0]);
    body.flush();
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
  body.add(new THREE.LatheGeometry(shadeProfile.reverse(), 24), 'iron', [0, -extension, 0]);
  body.add(new THREE.CylinderGeometry(0.195, 0.195, 0.008, 24), 'warm', [0, -0.418 - extension, 0]);
  body.add(new THREE.SphereGeometry(0.066, 16, 10), 'warm', [0, -0.427 - extension, 0]);
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
  body.add(new THREE.CylinderGeometry(0.104, 0.107, 0.02, 24), 'brass', [0, 0.01, 0]);
  const profile = [
    [0, 0.02],
    [0.09, 0.02],
    [0.089, 0.03],
    [0.086, 0.047],
    [0.075, 0.073],
    [0.054, 0.096],
    [0.025, 0.108],
    [0, 0.11],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  body.add(new THREE.LatheGeometry(profile, 24), 'brass');
  body.flush();
  const button = menuAnchor(root, 'bell-button', [0, 0.11, 0]);
  const buttonParts = kit.batch(button, 'bell-button');
  buttonParts.add(new THREE.CylinderGeometry(0.011, 0.011, 0.015, 12), 'iron', [0, 0.0075, 0]);
  const buttonCap = new THREE.SphereGeometry(0.022, 12, 6);
  buttonCap.scale(1, 0.35, 1);
  buttonParts.add(buttonCap, 'iron', [0, 0.016, 0]);
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
  body.add(box(0.7, 0.43, 0.26, 0.044), color, at(0, 0.24, 0));
  body.add(box(0.17, 0.024, 0.027, 0.009), color, at(0, 0.51, 0));
  for (const x of [-0.21, 0.21]) {
    body.add(
      suitcaseStrapGeometry(0.032 * sx, height, depth, radius, 0.004 * bevelScale),
      'brass',
      at(x, 0.24, 0),
    );
  }
  for (const x of [-0.31, 0.31]) {
    for (const y of [0.065, 0.415]) {
      for (const z of [-0.128, 0.128]) {
        body.add(box(0.07, 0.063, 0.014), 'brass', at(x, y, z));
      }
      for (const z of [-0.1, 0.1]) {
        body.add(box(0.014, 0.063, 0.049), 'brass', at(Math.sign(x) * 0.347, y, z));
      }
    }
    body.add(box(0.065, 0.025, 0.12), 'brass', at(x, 0.0125, 0));
  }
  for (const x of [-0.101, 0.101]) {
    body.add(box(0.037, 0.05, 0.015, 0.004), 'brass', at(x, 0.345, 0.137));
  }
  for (const x of [-0.073, 0.073]) {
    body.add(box(0.021, 0.065, 0.025, 0.006), 'brass', at(x, 0.481, 0));
    body.add(box(0.044, 0.01, 0.041, 0.003), 'brass', at(x, 0.455, 0));
  }
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
        strap: 0.194 * sx - decalSize / 2,
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
