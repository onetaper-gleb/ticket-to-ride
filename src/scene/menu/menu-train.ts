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
  const innerWidth = width - 0.07;
  const innerRise = rise - 0.032;
  const profile = new THREE.Shape();
  profile.moveTo(-width / 2, 0);
  profile.absellipse(0, 0, width / 2, rise, Math.PI, 0, true, 0);
  profile.lineTo(innerWidth / 2, 0.01);
  profile.absellipse(0, 0.01, innerWidth / 2, innerRise, 0, Math.PI, false, 0);
  profile.closePath();
  const roof = new THREE.ExtrudeGeometry(profile, {
    depth: length,
    steps: 1,
    curveSegments: 12,
    bevelEnabled: false,
  });
  roof.name = 'train-roof-shell';
  roof.translate(0, 0, -length / 2);
  batch.add(roof, kind, at);
}

function addRoofSeat(
  batch: TrainBatch,
  width: number,
  rise: number,
  bodyWidth: number,
  length: number,
  at: MenuPoint,
) {
  const innerHalfWidth = (width - 0.07) / 2;
  const innerRise = rise - 0.032;
  for (const side of [-1, 1]) {
    const lowX = side * (bodyWidth / 2 - 0.045);
    const highX = side * (bodyWidth / 2 - 0.002);
    const profile = new THREE.Shape();
    profile.moveTo(lowX, -0.04);
    profile.lineTo(highX, -0.04);
    for (let step = 0; step <= 4; step += 1) {
      const x = highX + ((lowX - highX) * step) / 4;
      const y = 0.013 + innerRise * Math.sqrt(1 - (x / innerHalfWidth) ** 2);
      profile.lineTo(x, y);
    }
    profile.closePath();
    const rail = new THREE.ExtrudeGeometry(profile, {
      depth: length,
      steps: 1,
      bevelEnabled: false,
    });
    rail.name = 'train-roof-seat';
    rail.translate(0, 0, -length / 2);
    batch.add(rail, 'green', at);
  }
}

function addRoofEaves(batch: TrainBatch, width: number, length: number, at: MenuPoint) {
  for (const side of [-1, 1]) {
    addBox(batch, 'iron', [0.032, 0.032, length], [side * (width / 2 - 0.016), at[1], at[2]]);
    addBox(batch, 'iron', [width, 0.032, 0.032], [0, at[1], at[2] + side * (length / 2 - 0.016)]);
  }
}

function roundedFramePath(path: THREE.Path, width: number, height: number, radius: number) {
  const x = width / 2;
  const y = height / 2;
  path.moveTo(-x + radius, -y);
  path.lineTo(x - radius, -y);
  path.quadraticCurveTo(x, -y, x, -y + radius);
  path.lineTo(x, y - radius);
  path.quadraticCurveTo(x, y, x - radius, y);
  path.lineTo(-x + radius, y);
  path.quadraticCurveTo(-x, y, -x, y - radius);
  path.lineTo(-x, -y + radius);
  path.quadraticCurveTo(-x, -y, -x + radius, -y);
  path.closePath();
}

function addWindowFrame(
  batch: TrainBatch,
  outside: readonly [number, number],
  aperture: readonly [number, number],
  depth: number,
  at: MenuPoint,
) {
  const profile = new THREE.Shape();
  roundedFramePath(profile, ...outside, 0.014);
  const opening = new THREE.Path();
  roundedFramePath(opening, ...aperture, 0.008);
  profile.holes.push(opening);
  const frame = new THREE.ExtrudeGeometry(profile, {
    depth,
    steps: 1,
    curveSegments: 3,
    bevelEnabled: false,
  });
  frame.name = 'train-window-frame';
  frame.translate(0, 0, -depth / 2);
  batch.add(frame, 'cream', at, [0, HALF_PI, 0]);
}

function addAxialProfile(
  batch: TrainBatch,
  kind: MenuMaterial,
  profile: readonly (readonly [number, number])[],
  at: MenuPoint,
  axis: 'x' | 'y' | 'z' = 'z',
  segments = 32,
  name?: string,
) {
  const geometry = new THREE.LatheGeometry(
    profile.map(([radius, axial]) => new THREE.Vector2(radius, axial)),
    segments,
  );
  if (name) {
    geometry.name = name;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex()!;
    const triangles: number[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i));
      b.fromBufferAttribute(position, index.getX(i + 1)).sub(a);
      c.fromBufferAttribute(position, index.getX(i + 2)).sub(a);
      if (b.cross(c).lengthSq() > 1e-20)
        triangles.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
    geometry.setIndex(triangles);
  }
  batch.add(
    geometry,
    kind,
    at,
    axis === 'z' ? [HALF_PI, 0, 0] : axis === 'x' ? [0, 0, -HALF_PI] : [0, 0, 0],
  );
}

function addPipe(
  batch: TrainBatch,
  kind: MenuMaterial,
  points: readonly MenuPoint[],
  radius: number,
  sleeveRadius = 0,
) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const pipe = new THREE.TubeGeometry(curve, 12, radius, 6, false);
  if (sleeveRadius > 0) pipe.name = 'train-fitted-pipe';
  batch.add(pipe, kind);
  if (sleeveRadius > 0) {
    for (const end of [0, 1]) {
      const center = curve.getPointAt(end);
      const tangent = curve.getTangentAt(end).multiplyScalar(0.016);
      addBar(
        batch,
        kind,
        [center.x - tangent.x, center.y - tangent.y, center.z - tangent.z],
        [center.x + tangent.x, center.y + tangent.y, center.z + tangent.z],
        sleeveRadius,
      );
    }
  }
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
      [0.416, 0.055],
      [0.407, 0.06],
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
    'train-smokebox-chamber',
  );
  addAxialProfile(
    batch,
    'steel',
    [
      [0, -0.023],
      [0.348, -0.023],
      [0.354, -0.01],
      [0.353, 0.006],
      [0.344, 0.017],
      [0.329, 0.028],
      [0.298, 0.037],
      [0.235, 0.042],
      [0, 0.042],
    ],
    [0, BOILER_Y, 1.008],
    'z',
    40,
    'train-front-door',
  );
  batch.add(new THREE.TorusGeometry(0.349, 0.012, 6, 40), 'steel', [0, BOILER_Y, 1.033]);
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    batch.add(new THREE.SphereGeometry(0.01, 8, 4), 'brass', [
      Math.cos(angle) * 0.384,
      BOILER_Y + Math.sin(angle) * 0.384,
      0.996,
    ]);
  }
  for (const y of [-0.135, 0.135]) {
    addBox(batch, 'steel', [0.084, 0.04, 0.02], [-0.293, BOILER_Y + y, 1.026], 0.006);
    addCylinder(batch, 'steel', 0.02, 0.02, 0.052, [-0.322, BOILER_Y + y, 1.037], [0, 0, 0], 12);
  }
  addCylinder(batch, 'steel', 0.03, 0.03, 0.025, [0, BOILER_Y - 0.13, 1.072], [HALF_PI, 0, 0], 12);
  addBox(batch, 'brass', [0.098, 0.017, 0.018], [0.025, BOILER_Y - 0.13, 1.09], 0.006);
  addCylinder(batch, 'steel', 0.022, 0.022, 0.018, [0, BOILER_Y - 0.13, 1.09], [HALF_PI, 0, 0], 12);

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
  addCylinder(batch, 'steel', 0.016, 0.016, 0.084, [0, 0.335, 1.149], [0, 0, HALF_PI], 12);
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
    addCylinder(
      batch,
      'steel',
      0.066,
      0.066,
      0.018,
      [side * 0.442, 0.485, 0.866],
      [HALF_PI, 0, 0],
      20,
    );
    addCylinder(
      batch,
      'brass',
      0.035,
      0.035,
      0.026,
      [side * 0.442, 0.485, 0.625],
      [HALF_PI, 0, 0],
      16,
    );
    addPipe(
      batch,
      'brass',
      [
        [side * 0.31, 0.7, -0.19],
        [side * 0.38, 0.66, -0.3],
        [side * 0.399, 0.635, -0.39],
        [side * 0.413, 0.61, -0.56],
        [side * 0.401, 0.57, -0.78],
      ],
      0.016,
      0.022,
    );
    addPipe(
      batch,
      'brass',
      [
        [side * 0.323, 1.177, -0.2],
        [side * 0.409, 1.15, -0.31],
        [side * 0.453, 1.1, -0.41],
        [side * 0.438, 1.08, -0.49],
      ],
      0.018,
      0.024,
    );
  }
  for (const side of [-1, 1]) {
    const railY = BOILER_Y + 0.15;
    addBar(batch, 'brass', [side * 0.43, railY, -0.28], [side * 0.43, railY, 0.78], 0.013);
    for (const z of [-0.2, 0.64]) {
      addBar(batch, 'brass', [side * 0.365, railY, z], [side * 0.43, railY, z], 0.011);
      addCylinder(
        batch,
        'brass',
        0.019,
        0.019,
        0.025,
        [side * 0.423, railY, z],
        [0, 0, HALF_PI],
        12,
      );
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
    addWindowFrame(batch, [0.508, 0.474], [0.446, 0.406], 0.0465, [side * 0.43925, 1.098, -0.77]);
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
  addRoofEaves(batch, 1.02, 0.8, [0, 1.413, -0.77]);
  addRoofSeat(batch, 1.02, 0.2, 0.88, 0.64, [0, 1.424, -0.77]);
  addArchedRoof(batch, 'iron', 1.02, 0.2, 0.82, [0, 1.424, -0.77]);
  addBox(batch, 'brass', [0.36, 0.025, 0.021], [0, 0.69, -1.094]);
}

function addCoach(batch: TrainBatch) {
  addBox(batch, 'iron', [0.77, 0.1, 2.29], [0, 0.355, COACH_Z], 0.018);
  addCoachBody(batch);
  addBox(batch, 'green', [0.83, 0.09, 2.17], [0, 0.805, COACH_Z]);
  addBox(batch, 'green', [0.83, 0.02, 2.17], [0, 1.23, COACH_Z]);
  for (const z of [-1.071, 1.071]) addBox(batch, 'green', [0.83, 0.48, 0.028], [0, 1, COACH_Z + z]);
  for (const side of [-1, 1]) {
    for (const [z, length] of [
      [-1.0055, 0.159],
      [-0.5, 0.148],
      [0, 0.148],
      [0.5, 0.148],
      [1.0055, 0.159],
    ])
      addBox(batch, 'green', [0.028, 0.37, length], [side * 0.401, 1.035, COACH_Z + z]);
    addBox(batch, 'brass', [0.022, 0.026, 2.14], [side * 0.427, 0.756, COACH_Z]);
    for (const z of [-0.75, -0.25, 0.25, 0.75]) {
      addWindowFrame(batch, [0.398, 0.43], [0.332, 0.35], 0.063, [
        side * 0.4315,
        1.035,
        COACH_Z + z,
      ]);
      addBox(batch, 'glassWarm', [0.016, 0.354, 0.336], [side * 0.4, 1.035, COACH_Z + z], 0.006);
      addBox(batch, 'cream', [0.025, 0.354, 0.02], [side * 0.449, 1.035, COACH_Z + z]);
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
  addRoofEaves(batch, 0.96, 2.4, [0, 1.257, COACH_Z]);
  addRoofSeat(batch, 0.96, 0.18, 0.83, 2.17, [0, 1.278, COACH_Z]);
  addArchedRoof(batch, 'iron', 0.96, 0.18, 2.44, [0, 1.278, COACH_Z]);
  addBox(batch, 'iron', [0.075, 0.06, 0.19], [0, 0.285, COACH_Z - 1.22]);
}

function addCoachBody(batch: TrainBatch) {
  const profile = new THREE.Shape();
  profile.moveTo(-0.385, 0.41);
  profile.lineTo(0.385, 0.41);
  profile.quadraticCurveTo(0.415, 0.41, 0.415, 0.49);
  profile.lineTo(0.415, 0.7);
  profile.quadraticCurveTo(0.415, 0.75, 0.39, 0.75);
  profile.lineTo(-0.39, 0.75);
  profile.quadraticCurveTo(-0.415, 0.75, -0.415, 0.7);
  profile.lineTo(-0.415, 0.49);
  profile.quadraticCurveTo(-0.415, 0.41, -0.385, 0.41);
  profile.closePath();
  const geometry = new THREE.ExtrudeGeometry(profile, {
    depth: 2.18,
    steps: 1,
    curveSegments: 4,
    bevelEnabled: false,
  });
  geometry.name = 'train-coach-lower-body';
  geometry.translate(0, 0, -1.09);
  batch.add(geometry, 'green', [0, 0, COACH_Z]);
}

function addWheelWeb(batch: TrainBatch, radius: number, x: number, angle: number) {
  const profile = new THREE.Shape();
  profile.moveTo(-radius * 0.08, radius * 0.24);
  profile.lineTo(radius * 0.08, radius * 0.24);
  profile.lineTo(radius * 0.05, radius * 0.87);
  profile.lineTo(-radius * 0.05, radius * 0.87);
  profile.closePath();
  const web = new THREE.ExtrudeGeometry(profile, {
    depth: 0.05,
    steps: 1,
    bevelEnabled: false,
  });
  web.name = 'train-wheel-web';
  web.translate(0, 0, -0.025);
  web.rotateY(HALF_PI);
  batch.add(web, 'steel', [x, 0, 0], [angle, 0, 0]);
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
    addAxialProfile(
      batch,
      'steel',
      [
        [0, -0.041],
        [radius * 0.24, -0.041],
        [radius * 0.28, -0.032],
        [radius * 0.31, -0.02],
        [radius * 0.31, 0.02],
        [radius * 0.28, 0.032],
        [radius * 0.24, 0.041],
        [0, 0.041],
      ],
      [x, 0, 0],
      'x',
      12,
      'train-wheel-hub',
    );
    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const angle = (spoke / spokes) * Math.PI * 2;
      addWheelWeb(batch, radius, x, angle);
    }
    const weight = new THREE.Shape();
    weight.absarc(0, 0, radius * 0.77, Math.PI * 0.79, Math.PI * 1.23, false);
    weight.absarc(0, 0, radius * 0.35, Math.PI * 1.23, Math.PI * 0.79, true);
    weight.closePath();
    const weightGeometry = new THREE.ExtrudeGeometry(weight, {
      depth: 0.072,
      steps: 1,
      curveSegments: 5,
      bevelEnabled: false,
    });
    weightGeometry.name = 'train-wheel-counterweight';
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
