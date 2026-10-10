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

/** Origin is the ceiling contact; fixture extends 0.493 units down -Y. No scene light. */
export function buildMenuLamp(kit: MenuModelKit): THREE.Group {
  const root = new THREE.Group();
  root.name = 'menu-lamp';
  const body = kit.batch(root, 'lamp');
  body.add(new THREE.CylinderGeometry(0.057, 0.057, 0.025, 16), 'iron', [0, -0.0125, 0]);
  body.add(new THREE.CylinderGeometry(0.019, 0.019, 0.23, 12), 'iron', [0, -0.126, 0]);
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
  body.add(new THREE.LatheGeometry(shadeProfile.reverse(), 24), 'iron');
  body.add(new THREE.CylinderGeometry(0.195, 0.195, 0.008, 24), 'warm', [0, -0.418, 0]);
  body.add(new THREE.SphereGeometry(0.066, 16, 10), 'warm', [0, -0.427, 0]);
  body.flush();
  root.userData.contact = { plane: 'Y=0', direction: '-Y', height: 0.493, diameter: 0.45 };
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

/** Author-made case; Y=0 is the floor. Two material batches, no painted decal proxy. */
export function buildMenuSuitcase(
  kit: MenuModelKit,
  color: 'wood' | 'green',
  stickers?: THREE.Texture,
): THREE.Group {
  const root = new THREE.Group();
  root.name = `menu-suitcase-${color}`;
  const body = kit.batch(root, 'suitcase');
  body.add(menuBox(0.7, 0.43, 0.26, 0.044), color, [0, 0.24, 0]);
  body.add(menuBox(0.17, 0.024, 0.027, 0.009), color, [0, 0.51, 0]);
  for (const x of [-0.21, 0.21]) {
    for (const z of [-0.133, 0.133]) {
      body.add(new THREE.BoxGeometry(0.032, 0.401, 0.008), 'brass', [x, 0.24, z]);
    }
    for (const y of [0.039, 0.441]) {
      body.add(new THREE.BoxGeometry(0.032, 0.008, 0.245), 'brass', [x, y, 0]);
    }
  }
  for (const x of [-0.31, 0.31]) {
    for (const y of [0.065, 0.415]) {
      for (const z of [-0.128, 0.128]) {
        body.add(new THREE.BoxGeometry(0.07, 0.063, 0.014), 'brass', [x, y, z]);
      }
      for (const z of [-0.1, 0.1]) {
        body.add(new THREE.BoxGeometry(0.014, 0.063, 0.049), 'brass', [Math.sign(x) * 0.347, y, z]);
      }
    }
    body.add(new THREE.BoxGeometry(0.065, 0.025, 0.12), 'brass', [x, 0.0125, 0]);
  }
  for (const x of [-0.101, 0.101]) {
    body.add(menuBox(0.037, 0.05, 0.015, 0.004), 'brass', [x, 0.345, 0.14]);
  }
  for (const x of [-0.073, 0.073]) {
    body.add(menuBox(0.021, 0.065, 0.025, 0.006), 'brass', [x, 0.481, 0]);
    body.add(menuBox(0.044, 0.01, 0.041, 0.003), 'brass', [x, 0.455, 0]);
  }
  body.flush();
  const frontDecal = menuAnchor(root, 'decal-front', [0, 0.18, 0.131]);
  if (stickers) {
    const geometry = new THREE.PlaneGeometry(0.21, 0.21);
    const uv = geometry.getAttribute('uv');
    const left = color === 'wood' ? 16 : 272;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (left + uv.getX(i) * 224) / 512, (272 + uv.getY(i) * 224) / 512);
    kit.mappedMesh(frontDecal, geometry, 'paper', stickers, 'luggage-print');
  }
  const sideDecal = menuAnchor(root, 'decal-side', [0.351, 0.235, 0]);
  sideDecal.rotation.y = Math.PI / 2;
  root.userData.decalSlots = [
    { name: 'decal-front', width: 0.21, height: 0.21, normal: '+Z', art: 'A07' },
    { name: 'decal-side', width: 0.09, height: 0.09, normal: '+X', art: 'A07' },
  ];
  root.userData.contact = { plane: 'Y=0', width: 0.708, height: 0.522, depth: 0.2845 };
  return root;
}
