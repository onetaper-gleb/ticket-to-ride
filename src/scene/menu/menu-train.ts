import * as THREE from 'three';
import {
  menuAnchor,
  menuBox,
  type MenuMaterial,
  type MenuModelKit,
  type MenuPoint,
} from './menu-model-utils';

type TrainBatch = ReturnType<MenuModelKit['batch']>;

export type MenuTrain = {
  root: THREE.Group;
  chimneyAnchor: THREE.Object3D;
  wheels: readonly THREE.Object3D[];
};

const HALF_PI = Math.PI / 2;
const COACH_Z = -2.55;
const BOILER_SECTION = 1.4;
const BOILER_RADIUS = 0.285 * BOILER_SECTION;
const BOILER_Y = 0.95;
const BOILER_TOP = BOILER_Y + BOILER_RADIUS;

/** Front is +Z. Wheel pivots rotate about +X; their bind rotation is zero. The kit owns all resources. */
export function buildMenuTrain(kit: MenuModelKit): MenuTrain {
  const root = new THREE.Group();
  root.name = 'menu-train';
  const staticParts = kit.batch(root, 'train-static');
  addLocomotive(staticParts);
  addCoach(staticParts);
  staticParts.flush();

  const wheels: THREE.Object3D[] = [];
  for (const z of [-0.55, -0.08, 0.39]) {
    wheels.push(
      addWheelAxle(kit, root, `locomotive-axle-${wheels.length + 1}`, z, 0.24, 0.425, 10),
    );
  }
  for (const z of [-0.79, -0.48, 0.48, 0.79]) {
    wheels.push(
      addWheelAxle(kit, root, `coach-axle-${wheels.length - 2}`, COACH_Z + z, 0.16, 0.395, 8),
    );
  }

  const chimneyAnchor = menuAnchor(root, 'train-chimney', [0, BOILER_TOP + 0.485, 0.61]);
  return { root, chimneyAnchor, wheels };
}

function addBox(batch: TrainBatch, kind: MenuMaterial, size: MenuPoint, at: MenuPoint, radius = 0) {
  const geometry = radius > 0 ? menuBox(...size, radius) : new THREE.BoxGeometry(...size);
  batch.add(geometry, kind, at);
}

function addCylinder(
  batch: TrainBatch,
  kind: MenuMaterial,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  at: MenuPoint,
  rotation: MenuPoint = [0, 0, 0],
  segments = 24,
) {
  batch.add(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    kind,
    at,
    rotation,
  );
}

function addBar(
  batch: TrainBatch,
  kind: MenuMaterial,
  from: MenuPoint,
  to: MenuPoint,
  radius = 0.018,
) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const rotation = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    ),
  );
  const center = start.add(end).multiplyScalar(0.5);
  addCylinder(
    batch,
    kind,
    radius,
    radius,
    direction.length(),
    [center.x, center.y, center.z],
    [rotation.x, rotation.y, rotation.z],
    8,
  );
}

function addArchedRoof(
  batch: TrainBatch,
  kind: MenuMaterial,
  width: number,
  rise: number,
  length: number,
  at: MenuPoint,
) {
  const profile = new THREE.Shape();
  profile.moveTo(-width / 2, 0);
  profile.lineTo(width / 2, 0);
  profile.quadraticCurveTo(width / 2 + 0.03, rise * 0.75, 0, rise);
  profile.quadraticCurveTo(-width / 2 - 0.03, rise * 0.75, -width / 2, 0);
  const roof = new THREE.ExtrudeGeometry(profile, {
    depth: length,
    steps: 1,
    curveSegments: 12,
    bevelEnabled: false,
  });
  roof.translate(0, 0, -length / 2);
  batch.add(roof, kind, at);
}

function addLocomotive(batch: TrainBatch) {
  addBox(batch, 'iron', [0.76, 0.15, 2.08], [0, 0.37, -0.04], 0.025);
  addBox(batch, 'green', [0.92, 0.09, 1.93], [0, 0.49, -0.1], 0.025);
  addCylinder(
    batch,
    'green',
    BOILER_RADIUS,
    BOILER_RADIUS,
    1.17,
    [0, BOILER_Y, 0.25],
    [HALF_PI, 0, 0],
    32,
  );
  addCylinder(
    batch,
    'iron',
    0.289 * BOILER_SECTION,
    0.289 * BOILER_SECTION,
    0.16,
    [0, BOILER_Y, 0.895],
    [HALF_PI, 0, 0],
    32,
  );
  addCylinder(
    batch,
    'iron',
    0.243 * BOILER_SECTION,
    0.243 * BOILER_SECTION,
    0.035,
    [0, BOILER_Y, 0.991],
    [HALF_PI, 0, 0],
    32,
  );

  for (const z of [-0.24, 0.27, 0.73]) {
    batch.add(new THREE.TorusGeometry(0.287 * BOILER_SECTION, 0.018, 6, 32), 'brass', [
      0,
      BOILER_Y,
      z,
    ]);
  }
  addCylinder(batch, 'brass', 0.1, 0.084, 0.15, [0, BOILER_TOP + 0.055, 0.045], [0, 0, 0], 20);
  batch.add(new THREE.SphereGeometry(0.1, 20, 10, 0, Math.PI * 2, 0, HALF_PI), 'brass', [
    0,
    BOILER_TOP + 0.13,
    0.045,
  ]);
  addCylinder(batch, 'iron', 0.104, 0.075, 0.45, [0, BOILER_TOP + 0.18, 0.61], [0, 0, 0], 24);
  addCylinder(batch, 'brass', 0.139, 0.106, 0.075, [0, BOILER_TOP + 0.4375, 0.61], [0, 0, 0], 24);
  addCylinder(batch, 'iron', 0.114, 0.114, 0.012, [0, BOILER_TOP + 0.478, 0.61], [0, 0, 0], 24);
  addCab(batch);

  addBox(batch, 'burgundy', [0.92, 0.18, 0.13], [0, 0.375, 1.045], 0.025);
  for (const x of [-0.3, 0.3]) {
    addCylinder(batch, 'iron', 0.067, 0.067, 0.19, [x, 0.38, 1.19], [HALF_PI, 0, 0], 16);
    addCylinder(batch, 'brass', 0.07, 0.07, 0.018, [x, 0.38, 1.285], [HALF_PI, 0, 0], 16);
  }
  addCylinder(batch, 'iron', 0.095, 0.095, 0.075, [0, BOILER_Y + 0.02, 1.047], [HALF_PI, 0, 0], 20);
  addCylinder(
    batch,
    'brass',
    0.077,
    0.077,
    0.013,
    [0, BOILER_Y + 0.02, 1.091],
    [HALF_PI, 0, 0],
    20,
  );
  addCylinder(batch, 'warm', 0.06, 0.06, 0.015, [0, BOILER_Y + 0.02, 1.103], [HALF_PI, 0, 0], 20);
  addBox(batch, 'iron', [0.11, 0.038, 0.11], [0, BOILER_Y - 0.091, 1.04]);

  for (let i = 0; i < 9; i += 1) {
    const x = (i - 4) * 0.088;
    addBar(batch, 'iron', [x * 0.78, 0.295, 1.06], [x, 0.09, 1.39], 0.015);
  }
  addBar(batch, 'iron', [-0.385, 0.09, 1.39], [0.385, 0.09, 1.39], 0.021);
  for (const x of [-0.455, 0.455]) {
    addBar(batch, 'iron', [x, 0.28, -0.55], [x, 0.28, 0.39], 0.02);
    addBox(batch, 'iron', [0.06, 0.08, 0.3], [x, 0.52, 0.77], 0.012);
  }
  for (const side of [-1, 1]) {
    const railY = BOILER_Y + 0.15;
    addBar(batch, 'brass', [side * 0.43, railY, -0.28], [side * 0.43, railY, 0.78], 0.013);
    for (const z of [-0.2, 0.64]) {
      addBar(batch, 'brass', [side * 0.365, railY, z], [side * 0.43, railY, z], 0.011);
    }
  }
  addBox(batch, 'iron', [0.07, 0.06, 0.36], [0, 0.285, -1.2]);
}

function addCab(batch: TrainBatch) {
  addBox(batch, 'green', [0.88, 0.28, 0.63], [0, 0.68, -0.77], 0.025);
  addBox(batch, 'woodDark', [0.79, 0.05, 0.55], [0, 0.837, -0.77]);
  addBox(batch, 'green', [0.88, 0.09, 0.64], [0, 1.372, -0.77], 0.018);
  for (const side of [-1, 1]) {
    const x = side * 0.4075;
    for (const z of [-1.06, -0.48]) {
      addBox(batch, 'green', [0.065, 0.47, 0.075], [x, 1.097, z]);
    }
    addBox(batch, 'glass', [0.018, 0.41, 0.45], [side * 0.425, 1.098, -0.77], 0.006);
    addBox(batch, 'brass', [0.025, 0.026, 0.46], [side * 0.438, 0.881, -0.77]);
    addBox(batch, 'brass', [0.025, 0.026, 0.46], [side * 0.438, 1.315, -0.77]);
    addBox(batch, 'green', [0.025, 0.41, 0.024], [side * 0.44, 1.098, -0.76]);
    addBox(batch, 'iron', [0.19, 0.06, 0.36], [side * 0.392, 0.455, -0.77], 0.012);
  }
  for (const z of [-1.075, -0.465]) {
    addBox(batch, 'glass', [0.73, 0.41, 0.018], [0, 1.098, z], 0.006);
    addBox(batch, 'green', [0.055, 0.47, 0.04], [0, 1.095, z]);
  }
  addArchedRoof(batch, 'iron', 1.0, 0.145, 0.76, [0, 1.4, -0.77]);
  addBox(batch, 'brass', [0.36, 0.025, 0.021], [0, 0.69, -1.094]);
}

function addCoach(batch: TrainBatch) {
  addBox(batch, 'iron', [0.77, 0.1, 2.29], [0, 0.355, COACH_Z], 0.018);
  addBox(batch, 'green', [0.8, 0.34, 2.18], [0, 0.58, COACH_Z], 0.025);
  addBox(batch, 'cream', [0.78, 0.46, 2.17], [0, 0.975, COACH_Z], 0.018);
  for (const x of [-0.398, 0.398]) {
    addBox(batch, 'brass', [0.022, 0.026, 2.14], [x, 0.767, COACH_Z]);
    for (const z of [-0.75, -0.25, 0.25, 0.75]) {
      addBox(batch, 'woodDark', [0.022, 0.345, 0.365], [x, 1.005, COACH_Z + z], 0.008);
      addBox(batch, 'glass', [0.015, 0.29, 0.312], [x * 1.036, 1.005, COACH_Z + z], 0.006);
      addBox(batch, 'cream', [0.013, 0.29, 0.025], [x * 1.06, 1.005, COACH_Z + z]);
    }
    addBox(batch, 'brass', [0.022, 0.026, 2.16], [x, 1.177, COACH_Z]);
  }
  for (const z of [-1.096, 1.096]) {
    addBox(batch, 'woodDark', [0.28, 0.68, 0.022], [0, 0.877, COACH_Z + z], 0.015);
    addBox(batch, 'glass', [0.19, 0.28, 0.012], [0, 1.027, COACH_Z + z * 1.015], 0.008);
    addCylinder(
      batch,
      'brass',
      0.024,
      0.024,
      0.026,
      [0.092, 0.814, COACH_Z + z * 1.023],
      [HALF_PI, 0, 0],
      8,
    );
    addBox(batch, 'iron', [0.51, 0.06, 0.14], [0, 0.456, COACH_Z + z * 1.036], 0.015);
  }
  for (const z of [-0.64, 0.64]) {
    addBox(batch, 'iron', [0.68, 0.11, 0.52], [0, 0.235, COACH_Z + z], 0.018);
  }
  addArchedRoof(batch, 'green', 0.87, 0.15, 2.38, [0, 1.21, COACH_Z]);
  addBox(batch, 'iron', [0.075, 0.06, 0.19], [0, 0.285, COACH_Z - 1.22]);
}

function addWheelAxle(
  kit: MenuModelKit,
  parent: THREE.Object3D,
  name: string,
  z: number,
  radius: number,
  halfTrack: number,
  spokes: number,
) {
  const pivot = menuAnchor(parent, name, [0, radius, z]);
  const batch = kit.batch(pivot, name);
  addCylinder(batch, 'iron', 0.028, 0.028, halfTrack * 2, [0, 0, 0], [0, 0, HALF_PI], 12);
  for (const side of [-1, 1]) {
    const x = side * halfTrack;
    batch.add(
      new THREE.TorusGeometry(radius - 0.024, 0.024, 6, 24),
      'iron',
      [x, 0, 0],
      [0, HALF_PI, 0],
    );
    batch.add(
      new THREE.CylinderGeometry(radius, radius, 0.034, 24, 1, true),
      'iron',
      [x, 0, 0],
      [0, 0, HALF_PI],
    );
    addCylinder(batch, 'iron', radius * 0.27, radius * 0.27, 0.075, [x, 0, 0], [0, 0, HALF_PI], 16);
    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const angle = (spoke / spokes) * Math.PI * 2;
      const length = radius * 0.73;
      const centerRadius = radius * 0.565;
      batch.add(
        new THREE.BoxGeometry(0.048, length, 0.029),
        'iron',
        [x, Math.cos(angle) * centerRadius, Math.sin(angle) * centerRadius],
        [angle, 0, 0],
      );
    }
  }
  batch.flush();
  return pivot;
}
