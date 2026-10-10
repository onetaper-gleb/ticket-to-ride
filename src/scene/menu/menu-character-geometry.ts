/**
 * Menu-only adaptation of this project's original cashier, kind 1.
 * Provenance: src/scene/characters.ts at bea9743c7622a7806a3d9b6824a9d912b0a41b65:
 * loft, curvedVolume, softPatch, characterFactory, sculptedFace/facePatch/faceRibbon,
 * buildHead, buildClothes and consolidateCharacter. The authored facial features
 * are retained, with proportions adapted to the menu frame; only her visible upper body
 * is built. This isolated snapshot does not import evolving gameplay characters.
 * Chair, badge, cards, arms and gameplay state are intentionally not constructed.
 * The body uses a uniform 0.20 scale, then translation (0, -0.08, -0.26), baked
 * into vertex positions. All Object3D transforms in the returned group are identity.
 * Mirrored lapels/collars reflect vertices and winding, never Object3D scale.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

type Point = [number, number, number];
type Ring = { y: number; width: number; front: number; back?: number; z?: number };

const CASHIER_STYLE = {
  name: 'Билетная кассирша',
  skin: '#edbb96',
  cheek: '#df9f87',
  hair: '#563e32',
  cloth: '#974a52',
  trim: '#71363e',
  shirt: '#efe0c6',
  width: 1.98,
  headWidth: 1.24,
  headHeight: 1.33,
  nose: [0.3, 0.31, 0.37] as Point,
};
const MENU_BODY_SCALE = 0.2;
const MENU_BODY_OFFSET = new THREE.Vector3(0, -0.08, -0.26);
const MENU_HEAD_SCALE = new THREE.Vector3(1.32, 1.2, 1.32);
const MENU_NECK_PIVOT = new THREE.Vector3(0, 2.71, 0.02);
const MENU_HEAD_LIFT = 0.525; // Authoring units: 0.105 after the body's baked scale.

function loft(rings: Ring[], exponent = 2.5, sides = 32) {
  const positions: number[] = [];
  const indices: number[] = [];
  const rounded = (value: number) => Math.sign(value) * Math.abs(value) ** (2 / exponent);
  for (const ring of rings) {
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const cosine = rounded(Math.cos(angle));
      positions.push(
        rounded(Math.sin(angle)) * ring.width,
        ring.y,
        cosine * (cosine >= 0 ? ring.front : (ring.back ?? ring.front)) + (ring.z ?? 0),
      );
    }
  }
  for (let level = 0; level < rings.length - 1; level++) {
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      const a = level * sides + i;
      const b = level * sides + next;
      const c = (level + 1) * sides + next;
      const d = (level + 1) * sides + i;
      indices.push(a, b, c, a, c, d);
    }
  }
  for (let i = 1; i < sides - 1; i++) {
    indices.push(0, i + 1, i);
    const last = (rings.length - 1) * sides;
    indices.push(last, last + i, last + i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Closed tapered sleeve in cashier-local coordinates. The caller owns its geometry. */
export function buildSleeve(
  points: readonly THREE.Vector3[],
  widths: readonly number[],
  depths: readonly number[] = widths,
): THREE.BufferGeometry {
  if (
    points.length < 2 ||
    widths.length < 2 ||
    depths.length !== widths.length ||
    points.some((point) => ![point.x, point.y, point.z].every(Number.isFinite)) ||
    [...widths, ...depths].some((radius) => !Number.isFinite(radius) || radius <= 0)
  ) {
    throw new RangeError(
      'Sleeves need at least two finite points and matching positive radius arrays.',
    );
  }
  const segments = 20;
  const curve = new THREE.CatmullRomCurve3(points.map((point) => point.clone()));
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const indices: number[] = [];
  const sides = 12;
  for (let section = 0; section <= segments; section++) {
    const t = section / segments;
    const sample = t * (widths.length - 1);
    const index = Math.min(widths.length - 2, Math.floor(sample));
    const amount = sample - index;
    const width = THREE.MathUtils.lerp(widths[index], widths[index + 1], amount);
    const depth = THREE.MathUtils.lerp(depths[index], depths[index + 1], amount);
    const center = curve.getPointAt(t);
    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      const vertex = center
        .clone()
        .addScaledVector(frames.normals[section], Math.cos(angle) * width)
        .addScaledVector(frames.binormals[section], Math.sin(angle) * depth);
      positions.push(vertex.x, vertex.y, vertex.z);
    }
  }
  for (let section = 0; section < segments; section++) {
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      const a = section * sides + side;
      const b = section * sides + next;
      const c = (section + 1) * sides + next;
      const d = (section + 1) * sides + side;
      indices.push(a, b, c, a, c, d);
    }
  }
  for (let side = 1; side < sides - 1; side++) {
    indices.push(0, side + 1, side);
    const last = segments * sides;
    indices.push(last, last + side, last + side + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function softPatch(points: [number, number][], depth = 0.1) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  for (const point of points.slice(1)) shape.lineTo(...point);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.065,
    bevelThickness: 0.065,
    bevelSegments: 3,
    steps: 1,
    curveSegments: 8,
  });
}

function characterFactory(parent: THREE.Group) {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string, roughness = 0.94) => {
    const key = `${color}:${roughness}`;
    let result = materials.get(key);
    if (!result) {
      result = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
      result.name = `Кассирша: ${color}`;
      materials.set(key, result);
    }
    return result;
  };
  const mesh = (
    geometry: THREE.BufferGeometry,
    color: string,
    position: Point = [0, 0, 0],
    target: THREE.Object3D = parent,
  ) => {
    const result = new THREE.Mesh(geometry, material(color));
    result.position.set(...position);
    result.castShadow = true;
    result.receiveShadow = true;
    target.add(result);
    return result;
  };
  const round = (size: Point, color: string, position: Point, target: THREE.Object3D = parent) =>
    mesh(new RoundedBoxGeometry(...size, 3, Math.min(...size) * 0.22), color, position, target);
  const oval = (size: Point, color: string, position: Point, target: THREE.Object3D = parent) => {
    const geometry = new THREE.SphereGeometry(1, 24, 16);
    geometry.scale(...size);
    return mesh(geometry, color, position, target);
  };
  const patch = (
    points: [number, number][],
    color: string,
    position: Point,
    target: THREE.Object3D = parent,
    depth = 0.1,
  ) => mesh(softPatch(points, depth), color, position, target);
  return { mesh, round, oval, patch, material };
}

type Factory = ReturnType<typeof characterFactory>;

type FaceForm = ReturnType<typeof sculptedFace>;

/** The face is one closed surface; facial volumes are displacements of that surface. */
function sculptedFace() {
  const style = CASHIER_STYLE;
  const w = style.headWidth;
  const h = style.headHeight;
  const exponent = 2.3;
  const profile = [
    [-1, 0, 0, 0],
    [-0.92, 0.36, 0.43, 0.34],
    [-0.76, 0.67, 0.67, 0.54],
    [-0.5, 0.88, 0.77, 0.74],
    [-0.18, 1, 0.81, 0.87],
    [0.18, 1, 0.79, 0.92],
    [0.52, 0.94, 0.74, 0.87],
    [0.79, 0.76, 0.58, 0.7],
    [0.95, 0.35, 0.29, 0.36],
    [1, 0, 0, 0],
  ];
  const section = (y: number) => {
    const t = THREE.MathUtils.clamp(y / h, -1, 1);
    let index = 0;
    while (index < profile.length - 2 && profile[index + 1][0] < t) index++;
    const a = profile[index];
    const b = profile[index + 1];
    const before = profile[Math.max(0, index - 1)];
    const after = profile[Math.min(profile.length - 1, index + 2)];
    const length = b[0] - a[0];
    const u = (t - a[0]) / length;
    const u2 = u * u;
    const u3 = u2 * u;
    return [1, 2, 3].map((component) => {
      const firstSlope = (b[component] - before[component]) / (b[0] - before[0]);
      const lastSlope = (after[component] - a[component]) / (after[0] - a[0]);
      return Math.max(
        0,
        (2 * u3 - 3 * u2 + 1) * a[component] +
          (u3 - 2 * u2 + u) * length * firstSlope +
          (-2 * u3 + 3 * u2) * b[component] +
          (u3 - u2) * length * lastSlope,
      );
    });
  };
  const gaussian = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
    Math.exp(-(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2));
  const eyeX = w * 0.41;
  const eyeY = 0.19;
  const eyeWidth = 0.255;
  const eyeHeight = 0.16;
  const mouthY = (x: number) => -0.7 + 0.095 * (x / 0.36) ** 2;
  const noseWidth = style.nose[0] * 0.96;
  const noseY = -0.13;
  const noseHeight = style.nose[1] * 0.77;
  const displacement = (x: number, y: number) => {
    // Wide cheek and jaw fields overlap the muzzle instead of forming circular cheek objects.
    let result = 0.085 * gaussian(x, y, 0, -0.99, w * 0.56, 0.29);
    result += 0.045 * gaussian(x, y, 0, -0.6, 0.58, 0.31);
    for (const side of [-1, 1]) {
      result += 0.115 * gaussian(x, y, side * w * 0.56, -0.37, w * 0.42, 0.4);
      result += 0.055 * gaussian(x, y, side * w * 0.64, -0.05, w * 0.36, 0.4);
      result -= 0.09 * gaussian(x, y, side * eyeX, eyeY, 0.31, 0.235);
      const ex = (x - side * eyeX) / (eyeWidth * 1.12);
      const ey = (y - eyeY) / (eyeHeight * 1.34);
      const radius = Math.hypot(ex, ey);
      result += 0.035 * Math.exp(-(((radius - 1.05) / 0.26) ** 2));
      result += 0.06 * gaussian(x, y, side * eyeX, eyeY + 0.24, 0.38, 0.15);
    }
    // Bridge, broad tip, alae and columella all belong to the same skin mesh.
    result += 0.13 * gaussian(x, y, 0, 0.16, noseWidth * 0.69, 0.49);
    result += (style.nose[2] + 0.1) * gaussian(x, y, 0, noseY, noseWidth, noseHeight);
    for (const side of [-1, 1])
      result +=
        0.065 * gaussian(x, y, side * noseWidth * 0.7, noseY - 0.075, noseWidth * 0.57, 0.17);
    result += 0.055 * gaussian(x, y, 0, noseY - 0.19, noseWidth * 0.46, 0.15);
    const lipY = mouthY(x);
    const lipMask = Math.exp(-((x / 0.39) ** 4));
    result += lipMask * (0.035 * Math.exp(-(((y - lipY - 0.045) / 0.06) ** 2)));
    result += lipMask * (0.038 * Math.exp(-(((y - lipY + 0.06) / 0.075) ** 2)));
    result -= lipMask * (0.022 * Math.exp(-(((y - lipY) / 0.025) ** 2)));
    return result;
  };
  const front = (x: number, y: number) => {
    const [width, depth] = section(y);
    const contour =
      Math.max(0, 1 - (Math.abs(x) / Math.max(0.001, width * w)) ** exponent) ** (1 / exponent);
    return depth * contour + displacement(x, y) * THREE.MathUtils.smoothstep(contour, 0, 0.3);
  };
  const positions: number[] = [0, -h, 0];
  const colors: number[] = [];
  const skin = new THREE.Color(style.skin);
  const blush = new THREE.Color(style.cheek);
  const colorAt = (x: number, y: number, facing: number) => {
    const warmth =
      0.18 *
      (gaussian(x, y, w * 0.58, -0.35, 0.49, 0.37) + gaussian(x, y, -w * 0.58, -0.35, 0.49, 0.37)) *
      Math.max(0, facing);
    const color = skin.clone().lerp(blush, warmth);
    colors.push(color.r, color.g, color.b);
  };
  colorAt(0, -h, 0);
  const sides = 128;
  const levels = 80;
  const indices: number[] = [];
  for (let level = 1; level < levels; level++) {
    const y = -Math.cos((level / levels) * Math.PI) * h;
    const [width, faceDepth, backDepth] = section(y);
    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      const sine = Math.sin(angle);
      const cosine = Math.cos(angle);
      const x = Math.sign(sine) * Math.abs(sine) ** (2 / exponent) * width * w;
      const contour = Math.sign(cosine) * Math.abs(cosine) ** (2 / exponent);
      const z = cosine > 0 ? front(x, y) : contour * backDepth;
      positions.push(x, y, z);
      colorAt(x, y, cosine);
    }
  }
  const top = positions.length / 3;
  positions.push(0, h, 0);
  colorAt(0, h, 0);
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    indices.push(0, 1 + next, 1 + side);
    for (let level = 0; level < levels - 2; level++) {
      const a = 1 + level * sides + side;
      const b = 1 + level * sides + next;
      const c = b + sides;
      const d = a + sides;
      indices.push(a, b, c, a, c, d);
    }
    const last = 1 + (levels - 2) * sides;
    indices.push(last + side, last + next, top);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, front, eyeX, eyeY, eyeWidth, eyeHeight, mouthY };
}

/** A shaped surface patch follows the sculpt rather than intersecting it as a sphere. */
function facePatch(
  face: FaceForm,
  center: [number, number],
  size: [number, number],
  offset: number,
  almond = false,
) {
  const positions: number[] = [center[0], center[1], face.front(...center) + offset];
  const indices: number[] = [];
  const sides = 48;
  const rings = 6;
  for (let ring = 1; ring <= rings; ring++) {
    const r = ring / rings;
    for (let side = 0; side < sides; side++) {
      const theta = (side / sides) * Math.PI * 2;
      const x = center[0] + Math.cos(theta) * size[0] * r;
      const y =
        center[1] +
        Math.sin(theta) * size[1] * r * (almond ? 1 - 0.28 * Math.abs(Math.cos(theta)) : 1);
      positions.push(x, y, face.front(x, y) + offset + 0.006 * (1 - r * r));
    }
  }
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    indices.push(0, 1 + side, 1 + next);
    for (let ring = 0; ring < rings - 1; ring++) {
      const a = 1 + ring * sides + side;
      const b = 1 + ring * sides + next;
      const c = b + sides;
      const d = a + sides;
      indices.push(a, d, c, a, c, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Tapered sculpted ridges stay embedded in the face along both edges. */
function faceRibbon(
  face: FaceForm,
  points: [number, number][],
  widths: number[],
  height: number,
  segments = 28,
) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const positions: number[] = [];
  const indices: number[] = [];
  const across = 8;
  for (let level = 0; level <= segments; level++) {
    const t = level / segments;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const sample = t * (widths.length - 1);
    const index = Math.min(widths.length - 2, Math.floor(sample));
    const width = THREE.MathUtils.lerp(widths[index], widths[index + 1], sample - index);
    for (let step = 0; step <= across; step++) {
      const u = (step / across) * 2 - 1;
      const x = center.x - tangent.y * width * u;
      const y = center.y + tangent.x * width * u;
      positions.push(x, y, face.front(x, y) + 0.007 + height * (1 - u * u));
    }
  }
  for (let level = 0; level < segments; level++) {
    for (let step = 0; step < across; step++) {
      const a = level * (across + 1) + step;
      const b = a + 1;
      const c = b + across + 1;
      const d = a + across + 1;
      indices.push(a, d, c, a, c, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildCashierHead(person: THREE.Group, factory: Factory) {
  const style = CASHIER_STYLE;
  const { mesh, oval, round, patch } = factory;
  const head = new THREE.Group();
  // Fit the broad head to the reference frame while retaining overlap with the neck.
  head.position
    .set(-0.07, 4.05, 0.04)
    .sub(MENU_NECK_PIVOT)
    .multiply(MENU_HEAD_SCALE)
    .add(MENU_NECK_PIVOT);
  head.position.y += MENU_HEAD_LIFT;
  head.scale.copy(MENU_HEAD_SCALE);
  head.rotation.set(-0.075, -0.055, 0.05);
  person.add(head);
  const w = style.headWidth;
  const h = style.headHeight;
  const face = sculptedFace();
  const faceMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
  });
  faceMaterial.name = 'Скульптура лица: ' + style.name;
  const skinMesh = new THREE.Mesh(face.geometry, faceMaterial);
  skinMesh.name = 'Цельная скульптура головы';
  skinMesh.castShadow = true;
  skinMesh.receiveShadow = true;
  head.add(skinMesh);
  for (const side of [-1, 1]) {
    const ear = new THREE.SphereGeometry(1, 40, 28);
    const position = ear.getAttribute('position');
    for (let vertex = 0; vertex < position.count; vertex++) {
      const x = position.getX(vertex),
        y = position.getY(vertex),
        z = position.getZ(vertex);
      const bowl = Math.exp(-((x / 0.55) ** 2 + (y / 0.65) ** 2));
      position.setXYZ(
        vertex,
        x * 0.235 * (1 - y * 0.12),
        y * 0.395,
        z >= 0
          ? 0.08 + 0.1 * z - 0.075 * bowl * THREE.MathUtils.smoothstep(z, 0, 0.35)
          : 0.08 + 0.24 * z,
      );
    }
    ear.computeVertexNormals();
    mesh(ear, style.skin, [side * w * 1.015, -0.035, -0.08], head);
    const cx = side * face.eyeX;
    const cy = face.eyeY;
    mesh(
      facePatch(face, [cx, cy], [face.eyeWidth, face.eyeHeight], 0.014, true),
      '#e2dac9',
      [0, 0, 0],
      head,
    );
    const pupilX = cx - side * 0.035;
    mesh(
      facePatch(face, [pupilX, cy - 0.009], [0.135, face.eyeHeight * 0.9], 0.026),
      '#24272a',
      [0, 0, 0],
      head,
    );
    mesh(
      facePatch(face, [pupilX - 0.028, cy + 0.035], [0.024, 0.026], 0.036),
      '#f0e6d2',
      [0, 0, 0],
      head,
    );
    // The eyelid volume is part of the head; only the narrow upper lash line is a patch.
    mesh(
      faceRibbon(
        face,
        [
          [cx - face.eyeWidth * 0.96, cy],
          [cx - face.eyeWidth * 0.44, cy + face.eyeHeight * 0.85],
          [cx + face.eyeWidth * 0.42, cy + face.eyeHeight * 0.85],
          [cx + face.eyeWidth * 0.96, cy],
        ],
        [0.003, 0.015, 0.014, 0.003],
        0.004,
      ),
      '#604a3c',
      [0, 0, 0],
      head,
    );
    const browY = cy + 0.27;
    mesh(
      faceRibbon(
        face,
        [
          [side * (face.eyeX - 0.29), browY - 0.025],
          [side * (face.eyeX - 0.13), browY + 0.07],
          [side * (face.eyeX + 0.13), browY + 0.045],
          [side * (face.eyeX + 0.32), browY - 0.07],
        ],
        [0.015, 0.105, 0.09, 0.012],
        0.065,
      ),
      style.hair,
      [0, 0, 0],
      head,
    );
  }
  const mouthPoints: [number, number][] = [-0.36, -0.2, 0, 0.2, 0.36].map((x) => [
    x,
    face.mouthY(x),
  ]);
  mesh(
    faceRibbon(face, mouthPoints, [0.005, 0.016, 0.021, 0.016, 0.005], 0.004),
    '#775044',
    [0, 0, 0],
    head,
  );
  mesh(
    loft([
      { y: -h * 0.76, width: w * 0.86, front: 0.17, back: 0.66, z: -0.29 },
      { y: -h * 0.45, width: w * 1.08, front: 0.29, back: 0.76, z: -0.29 },
      { y: h * 0.43, width: w * 1.09, front: 0.38, back: 0.85, z: -0.19 },
      { y: h * 0.81, width: w * 0.94, front: 0.57, back: 0.75, z: -0.11 },
      { y: h * 1.03, width: w * 0.62, front: 0.45, back: 0.5 },
      { y: h * 1.09, width: 0.04, front: 0.04 },
    ]),
    style.hair,
    [0, 0, 0],
    head,
  );
  const fringe = patch(
    [
      [-1.06, -0.33],
      [-1.05, 0.39],
      [-0.54, 0.64],
      [0.5, 0.56],
      [0.92, 0.32],
      [0.38, 0.21],
      [-0.18, 0.12],
      [-0.7, -0.36],
    ],
    style.hair,
    [0, h * 0.6, 0.65],
    head,
    0.19,
  );
  fringe.rotation.z = -0.07;
  for (const side of [-1, 1])
    oval([0.24, 0.78, 0.24], style.hair, [side * w * 0.99, -0.08, 0.15], head);
  round([0.4, 0.16, 0.11], '#ccb375', [w * 0.77, h * 0.55, 0.77], head).rotation.z = -0.25;
}

function buildCashierClothes(person: THREE.Group, factory: Factory) {
  const { mesh, round, oval, patch } = factory;
  const style = CASHIER_STYLE;
  const w = style.width;
  mesh(
    loft(
      [
        { y: -0.51, width: w * 0.46, front: 0.53, back: 0.55, z: -0.12 },
        { y: -0.24, width: w * 0.72, front: 0.76, back: 0.66, z: -0.13 },
        { y: 0.57, width: w * 0.9, front: 0.86, back: 0.7, z: -0.12 },
        { y: 1.47, width: w, front: 0.88, back: 0.74, z: -0.1 },
        { y: 2.22, width: w * 0.99, front: 0.81, back: 0.69, z: -0.06 },
        { y: 2.65, width: w * 0.86, front: 0.64, back: 0.53 },
        { y: 2.91, width: w * 0.54, front: 0.4, back: 0.37, z: 0.02 },
        { y: 3.0, width: 0.49, front: 0.34, back: 0.33, z: 0.03 },
      ],
      2.6,
    ),
    style.cloth,
  );
  oval([0.48, 0.5, 0.43], style.skin, [0, 2.98, 0.02]);
  round([0.84, 2.08, 0.16], style.shirt, [0, 1.84, 0.79]);
  for (const side of [-1, 1]) {
    const lapel = patch(
      [
        [-0.14, 0.81],
        [0.53, 0.81],
        [0.82, 0.14],
        [0.48, -0.03],
        [0.03, -0.88],
        [-0.19, -0.09],
      ],
      style.trim,
      [side * 0.43, 2.02, 0.84],
      person,
      0.1,
    );
    if (side < 0) reflectGeometryX(lapel.geometry);
    lapel.rotation.y = side * 0.09;
    const collar = patch(
      [
        [-0.13, 0.22],
        [0.35, 0.33],
        [0.69, -0.05],
        [0.15, -0.35],
      ],
      style.shirt,
      [side * 0.29, 2.71, 0.87],
      person,
      0.09,
    );
    if (side < 0) reflectGeometryX(collar.geometry);
  }
  for (const y of [1.14, 0.57]) oval([0.085, 0.085, 0.06], '#ccb477', [0.13, y, 0.83]);
  round([0.66, 0.29, 0.08], style.trim, [-w * 0.58, 1.24, 0.81]).rotation.z = -0.08;
  // The menu's collar and bow share cream cloth, replacing the snapshot's ochre bow.
  oval([0.25, 0.21, 0.13], style.shirt, [0, 2.59, 1.01]);
  for (const side of [-1, 1])
    oval([0.36, 0.22, 0.14], style.shirt, [side * 0.26, 2.54, 0.96]).rotation.z = side * 0.17;
}

/** Reflection is baked into geometry and triangle order; object scale stays positive. */
function reflectGeometryX(geometry: THREE.BufferGeometry): void {
  const positions = geometry.getAttribute('position');
  for (let vertex = 0; vertex < positions.count; vertex++)
    positions.setX(vertex, -positions.getX(vertex));
  if (geometry.index) {
    for (let vertex = 0; vertex < geometry.index.count; vertex += 3) {
      const saved = geometry.index.getX(vertex + 1);
      geometry.index.setX(vertex + 1, geometry.index.getX(vertex + 2));
      geometry.index.setX(vertex + 2, saved);
    }
  } else {
    for (const attribute of Object.values(geometry.attributes)) {
      if (!(attribute instanceof THREE.BufferAttribute)) continue;
      for (let vertex = 0; vertex < attribute.count; vertex += 3) {
        for (let component = 0; component < attribute.itemSize; component++) {
          const saved = attribute.getComponent(vertex + 1, component);
          attribute.setComponent(
            vertex + 1,
            component,
            attribute.getComponent(vertex + 2, component),
          );
          attribute.setComponent(vertex + 2, component, saved);
        }
      }
    }
  }
  geometry.computeVertexNormals();
}

/** Bake local menu coordinates and merge only static body meshes by material. */
function consolidateUpperBody(person: THREE.Group): void {
  person.updateMatrixWorld(true);
  const inverseRoot = person.matrixWorld.clone().invert();
  const menuTransform = new THREE.Matrix4().compose(
    MENU_BODY_OFFSET,
    new THREE.Quaternion(),
    new THREE.Vector3().setScalar(MENU_BODY_SCALE),
  );
  const buckets = new Map<
    THREE.Material,
    { geometry: THREE.BufferGeometry; object: THREE.Mesh }[]
  >();
  person.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    for (const key of Object.keys(geometry.attributes))
      if (key !== 'position' && key !== 'normal' && key !== 'color') geometry.deleteAttribute(key);
    const transform = menuTransform.clone().multiply(inverseRoot).multiply(object.matrixWorld);
    geometry.applyMatrix4(transform);
    const entries = buckets.get(object.material) ?? [];
    entries.push({ geometry, object });
    buckets.set(object.material, entries);
  });
  const obsolete = new Set<THREE.BufferGeometry>();
  for (const [material, entries] of buckets) {
    const geometry = mergeGeometries(
      entries.map((entry) => entry.geometry),
      false,
    );
    entries.forEach((entry) => entry.geometry.dispose());
    if (!geometry) throw new Error('Could not merge static cashier geometry.');
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material.name || 'Статичная кассирша ' + material.uuid;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    person.add(mesh);
    for (const { object } of entries) {
      obsolete.add(object.geometry);
      object.removeFromParent();
    }
  }
  obsolete.forEach((geometry) => geometry.dispose());
  // Remove the now-empty construction head group; callers receive identity transforms.
  for (const child of [...person.children])
    if (child instanceof THREE.Group && child.children.length === 0) child.removeFromParent();
}

/**
 * Static authored upper body, already in cashier-local menu units. Geometry and
 * materials are unique to the returned group and owned by its cashier bundle.
 * Head/body animation is outside P1; sleeves, cuffs and hands are built separately.
 */
export function buildCashierUpperBody(): THREE.Group {
  const person = new THREE.Group();
  person.name = 'Статичный верх кассирши меню';
  const factory = characterFactory(person);
  buildCashierClothes(person, factory);
  buildCashierHead(person, factory);
  consolidateUpperBody(person);
  return person;
}
