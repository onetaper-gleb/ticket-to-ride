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

  const chimneyAnchor = menuAnchor(root, 'train-chimney', [0, BOILER_TOP + 0.477, 0.61]);
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
  profile.absellipse(0, 0, width / 2, rise, 0, Math.PI, false, 0);
  profile.closePath();
  const roof = new THREE.ExtrudeGeometry(profile, {
    depth: length,
    steps: 1,
    curveSegments: 12,
    bevelEnabled: false,
  });
  roof.translate(0, 0, -length / 2);
  batch.add(roof, kind, at);
}

function addAxialProfile(
  batch: TrainBatch,
  kind: MenuMaterial,
  profile: readonly (readonly [number, number])[],
  at: MenuPoint,
  axis: 'y' | 'z' = 'z',
  segments = 32,
) {
  batch.add(
    new THREE.LatheGeometry(
      profile.map(([radius, axial]) => new THREE.Vector2(radius, axial)),
      segments,
    ),
    kind,
    at,
    axis === 'z' ? [HALF_PI, 0, 0] : [0, 0, 0],
  );
}

function addPipe(
  batch: TrainBatch,
  kind: MenuMaterial,
  points: readonly MenuPoint[],
  radius: number,
) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  batch.add(new THREE.TubeGeometry(curve, 12, radius, 6, false), kind);
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
    48,
  );
  addAxialProfile(
    batch,
    'iron',
    [
      [0, -0.09],
      [0.385, -0.09],
      [0.405, -0.08],
      [0.416, -0.04],
      [0.416, 0.045],
      [0.407, 0.078],
      [0.386, 0.084],
      [0.382, 0.064],
      [0.393, 0.05],
      [0.393, -0.065],
      [0, -0.065],
      [0, -0.09],
    ],
    [0, BOILER_Y, 0.91],
    'z',
    40,
  );
  addAxialProfile(
    batch,
    'steel',
    [
      [0, 0.052],
      [0, -0.023],
      [0.348, -0.023],
      [0.354, -0.01],
      [0.35, 0.009],
      [0.338, 0.024],
      [0.309, 0.039],
      [0.25, 0.051],
      [0, 0.052],
    ],
    [0, BOILER_Y, 1.008],
    'z',
    40,
  );
  batch.add(new THREE.TorusGeometry(0.349, 0.012, 6, 40), 'steel', [0, BOILER_Y, 1.033]);
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    batch.add(new THREE.SphereGeometry(0.014, 8, 4), 'brass', [
      Math.cos(angle) * 0.384,
      BOILER_Y + Math.sin(angle) * 0.384,
      0.996,
    ]);
  }
  for (const y of [-0.135, 0.135]) {
    addBox(batch, 'steel', [0.082, 0.04, 0.047], [-0.293, BOILER_Y + y, 1.034], 0.012);
  }
  addCylinder(batch, 'steel', 0.03, 0.03, 0.025, [0, BOILER_Y - 0.13, 1.072], [HALF_PI, 0, 0], 12);
  addBox(batch, 'brass', [0.098, 0.017, 0.018], [0.025, BOILER_Y - 0.13, 1.09], 0.006);

  for (const z of [-0.24, 0.27, 0.73]) {
    batch.add(new THREE.TorusGeometry(0.287 * BOILER_SECTION, 0.018, 6, 32), 'brass', [
      0,
      BOILER_Y,
      z,
    ]);
  }
  addCylinder(batch, 'green', 0.105, 0.09, 0.13, [0, BOILER_TOP + 0.035, 0.045], [0, 0, 0], 20);
  batch.add(new THREE.SphereGeometry(0.105, 20, 10, 0, Math.PI * 2, 0, HALF_PI), 'green', [
    0,
    BOILER_TOP + 0.1,
    0.045,
  ]);
  batch.add(
    new THREE.TorusGeometry(0.104, 0.008, 6, 24),
    'brass',
    [0, BOILER_TOP + 0.09, 0.045],
    [HALF_PI, 0, 0],
  );
  addCylinder(batch, 'iron', 0.105, 0.135, 0.08, [0, BOILER_TOP + 0.005, 0.61], [0, 0, 0], 24);
  addAxialProfile(
    batch,
    'paper',
    [
      [0.11, 0.045],
      [0.1, 0.09],
      [0.098, 0.32],
      [0.115, 0.4],
      [0.151, 0.42],
      [0.158, 0.455],
      [0.149, 0.475],
      [0.12, 0.475],
      [0.117, 0.439],
      [0.103, 0.42],
      [0.088, 0.32],
      [0.08, 0.09],
      [0.078, 0.045],
      [0.11, 0.045],
    ],
    [0, BOILER_TOP, 0.61],
    'y',
    32,
  );
  addCylinder(batch, 'iron', 0.096, 0.096, 0.012, [0, BOILER_TOP + 0.412, 0.61], [0, 0, 0], 24);
  addCab(batch);

  addBox(batch, 'red', [0.98, 0.19, 0.14], [0, 0.375, 1.05], 0.025);
  for (const x of [-0.31, 0.31]) {
    addCylinder(batch, 'iron', 0.077, 0.082, 0.032, [x, 0.385, 1.134], [HALF_PI, 0, 0], 20);
    addCylinder(batch, 'steel', 0.055, 0.055, 0.16, [x, 0.385, 1.218], [HALF_PI, 0, 0], 20);
    addAxialProfile(
      batch,
      'iron',
      [
        [0, 0.035],
        [0, -0.024],
        [0.093, -0.024],
        [0.108, -0.018],
        [0.111, 0.002],
        [0.105, 0.018],
        [0.075, 0.031],
        [0, 0.035],
      ],
      [x, 0.385, 1.307],
      'z',
      24,
    );
  }
  for (const x of [-0.44, 0.44]) {
    addCylinder(batch, 'steel', 0.016, 0.016, 0.014, [x, 0.416, 1.131], [HALF_PI, 0, 0], 8);
  }
  addBox(batch, 'iron', [0.07, 0.084, 0.08], [0, 0.325, 1.148], 0.018);
  addPipe(
    batch,
    'steel',
    [
      [0, 0.335, 1.149],
      [0, 0.235, 1.2],
      [0, 0.22, 1.266],
      [0, 0.283, 1.284],
    ],
    0.027,
  );
  addCylinder(batch, 'iron', 0.095, 0.095, 0.075, [0, BOILER_Y + 0.02, 1.092], [HALF_PI, 0, 0], 20);
  addCylinder(
    batch,
    'brass',
    0.077,
    0.077,
    0.013,
    [0, BOILER_Y + 0.02, 1.136],
    [HALF_PI, 0, 0],
    20,
  );
  addCylinder(batch, 'warm', 0.06, 0.06, 0.015, [0, BOILER_Y + 0.02, 1.148], [HALF_PI, 0, 0], 20);
  addBox(batch, 'steel', [0.11, 0.038, 0.11], [0, BOILER_Y - 0.091, 1.085]);

  for (let i = 0; i < 9; i += 1) {
    const x = (i - 4) * 0.088;
    addBar(batch, 'iron', [x * 0.78, 0.295, 1.06], [x, 0.09, 1.39], 0.015);
  }
  addBar(batch, 'iron', [-0.385, 0.09, 1.39], [0.385, 0.09, 1.39], 0.021);
  for (const side of [-1, 1]) {
    const x = side * 0.484;
    addBox(batch, 'steel', [0.04, 0.046, 0.94], [x, 0.325, -0.08], 0.01);
    addBar(batch, 'steel', [x, 0.325, 0.39], [x, 0.48, 0.73], 0.023);
    addCylinder(
      batch,
      'steel',
      0.068,
      0.068,
      0.25,
      [side * 0.442, 0.485, 0.745],
      [HALF_PI, 0, 0],
      20,
    );
    addPipe(
      batch,
      'brass',
      [
        [side * 0.31, 0.7, -0.19],
        [side * 0.399, 0.635, -0.39],
        [side * 0.401, 0.57, -0.78],
      ],
      0.016,
    );
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
  addBox(batch, 'iron', [0.79, 0.05, 0.55], [0, 0.837, -0.77]);
  addBox(batch, 'green', [0.61, 0.42, 0.2], [0, 0.775, -0.36], 0.035);
  addBox(batch, 'green', [0.88, 0.09, 0.64], [0, 1.372, -0.77], 0.018);
  for (const side of [-1, 1]) {
    const x = side * 0.4075;
    for (const z of [-1.06, -0.48]) {
      addBox(batch, 'green', [0.065, 0.47, 0.075], [x, 1.097, z]);
    }
    addBox(batch, 'glassWarm', [0.018, 0.41, 0.45], [side * 0.425, 1.098, -0.77], 0.006);
    addBox(batch, 'cream', [0.031, 0.036, 0.47], [side * 0.442, 0.881, -0.77], 0.006);
    addBox(batch, 'cream', [0.031, 0.036, 0.47], [side * 0.442, 1.315, -0.77], 0.006);
    for (const z of [-1.006, -0.534]) {
      addBox(batch, 'cream', [0.03, 0.43, 0.028], [side * 0.442, 1.098, z], 0.006);
    }
    addBox(batch, 'cream', [0.027, 0.41, 0.024], [side * 0.449, 1.098, -0.76]);
    addBox(batch, 'steel', [0.19, 0.06, 0.36], [side * 0.392, 0.455, -0.77], 0.012);
    addBox(batch, 'brass', [0.017, 0.025, 0.18], [side * 0.453, 0.69, -0.76], 0.006);
  }
  for (const z of [-1.075, -0.465]) {
    addBox(batch, 'glassWarm', [0.73, 0.41, 0.018], [0, 1.098, z], 0.006);
    addBox(batch, 'cream', [0.037, 0.43, 0.023], [0, 1.095, z < -0.7 ? z - 0.015 : z + 0.015]);
    for (const y of [0.88, 1.315]) {
      addBox(batch, 'cream', [0.73, 0.033, 0.021], [0, y, z < -0.7 ? z - 0.015 : z + 0.015]);
    }
  }
  addBox(batch, 'iron', [1.02, 0.038, 0.8], [0, 1.413, -0.77], 0.014);
  addArchedRoof(batch, 'iron', 1.02, 0.2, 0.82, [0, 1.424, -0.77]);
  addBox(batch, 'brass', [0.36, 0.025, 0.021], [0, 0.69, -1.094]);
}

function addCoach(batch: TrainBatch) {
  addBox(batch, 'iron', [0.77, 0.1, 2.29], [0, 0.355, COACH_Z], 0.018);
  addBox(batch, 'green', [0.83, 0.34, 2.18], [0, 0.58, COACH_Z], 0.025);
  addBox(batch, 'green', [0.83, 0.48, 2.17], [0, 1.0, COACH_Z], 0.018);
  for (const side of [-1, 1]) {
    addBox(batch, 'brass', [0.022, 0.026, 2.14], [side * 0.427, 0.756, COACH_Z]);
    for (const z of [-0.75, -0.25, 0.25, 0.75]) {
      addBox(batch, 'cream', [0.039, 0.43, 0.398], [side * 0.431, 1.025, COACH_Z + z], 0.012);
      addBox(batch, 'glassWarm', [0.016, 0.35, 0.324], [side * 0.458, 1.035, COACH_Z + z], 0.006);
      addBox(batch, 'cream', [0.025, 0.35, 0.023], [side * 0.47, 1.035, COACH_Z + z]);
      addBox(batch, 'cream', [0.025, 0.022, 0.324], [side * 0.47, 1.08, COACH_Z + z]);
    }
    for (const z of [-0.985, -0.5, 0, 0.5, 0.985]) {
      addBox(batch, 'green', [0.017, 0.275, 0.018], [side * 0.426, 0.586, COACH_Z + z]);
    }
    addBox(batch, 'brass', [0.019, 0.021, 2.16], [side * 0.431, 1.245, COACH_Z]);
  }
  for (const z of [-1.096, 1.096]) {
    addBox(batch, 'green', [0.31, 0.73, 0.025], [0, 0.89, COACH_Z + z], 0.015);
    addBox(batch, 'cream', [0.255, 0.415, 0.026], [0, 1.04, COACH_Z + z * 1.019], 0.008);
    addBox(batch, 'glassWarm', [0.19, 0.35, 0.012], [0, 1.05, COACH_Z + z * 1.04], 0.008);
    addBox(batch, 'cream', [0.017, 0.35, 0.023], [0, 1.05, COACH_Z + z * 1.048]);
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
    addBox(batch, 'steel', [0.51, 0.06, 0.14], [0, 0.456, COACH_Z + z * 1.036], 0.015);
  }
  for (const z of [-0.64, 0.64]) {
    addBox(batch, 'iron', [0.68, 0.11, 0.52], [0, 0.235, COACH_Z + z], 0.018);
  }
  addBox(batch, 'iron', [0.96, 0.043, 2.4], [0, 1.257, COACH_Z], 0.014);
  addArchedRoof(batch, 'iron', 0.96, 0.18, 2.44, [0, 1.278, COACH_Z]);
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
  addCylinder(batch, 'steel', 0.028, 0.028, halfTrack * 2, [0, 0, 0], [0, 0, HALF_PI], 12);
  for (const side of [-1, 1]) {
    const x = side * halfTrack;
    batch.add(
      new THREE.TorusGeometry(radius - 0.028, 0.028, 8, 24),
      'steel',
      [x, 0, 0],
      [0, HALF_PI, 0],
    );
    batch.add(
      new THREE.CylinderGeometry(radius, radius, 0.034, 24, 1, true),
      'steel',
      [x, 0, 0],
      [0, 0, HALF_PI],
    );
    addCylinder(
      batch,
      'steel',
      radius * 0.28,
      radius * 0.31,
      0.082,
      [x, 0, 0],
      [0, 0, HALF_PI],
      20,
    );
    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const angle = (spoke / spokes) * Math.PI * 2;
      const length = radius * 0.73;
      const centerRadius = radius * 0.565;
      batch.add(
        new THREE.BoxGeometry(0.064, length, 0.038),
        'steel',
        [x, Math.cos(angle) * centerRadius, Math.sin(angle) * centerRadius],
        [angle, 0, 0],
      );
    }
    const weight = new THREE.Shape();
    weight.absarc(0, 0, radius * 0.77, Math.PI * 0.72, Math.PI * 1.3, false);
    weight.absarc(0, 0, radius * 0.35, Math.PI * 1.3, Math.PI * 0.72, true);
    weight.closePath();
    const weightGeometry = new THREE.ExtrudeGeometry(weight, {
      depth: 0.072,
      steps: 1,
      curveSegments: 5,
      bevelEnabled: false,
    });
    weightGeometry.translate(0, 0, -0.036);
    batch.add(weightGeometry, 'steel', [x, 0, 0], [0, HALF_PI, 0]);
    if (name.startsWith('locomotive')) {
      addCylinder(
        batch,
        'steel',
        0.036,
        0.036,
        0.105,
        [x + side * 0.025, 0.085, 0],
        [0, 0, HALF_PI],
        16,
      );
    }
  }
  batch.flush();
  return pivot;
}
