/**
 * Menu-only adaptation of this project's original cashier, kind 1.
 * Provenance: src/scene/characters.ts at bea9743c7622a7806a3d9b6824a9d912b0a41b65:
 * loft, curvedVolume, softPatch, characterFactory, sculptedFace/facePatch/faceRibbon,
 * buildHead, buildClothes and consolidateCharacter. Facial forms, hair and clothes
 * are adapted to the reference menu frame; only her visible upper body
 * is built. This isolated snapshot does not import evolving gameplay characters.
 * Chair, badge, cards, arms and gameplay state are intentionally not constructed.
 * The body uses a uniform 0.20 scale, then translation (0, -0.08, -0.26), baked
 * into vertex positions. All Object3D transforms in the returned group are identity.
 * Mirrored lapels/collars reflect vertices and winding, never Object3D scale.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MENU_CASHIER_PALETTE } from './menu-character-materials';

type Point = [number, number, number];
type Ring = {
  y: number;
  width: number;
  front: number;
  back?: number;
  z?: number;
};

const CASHIER_STYLE = {
  name: 'Билетная кассирша',
  skin: MENU_CASHIER_PALETTE.skin,
  cheek: MENU_CASHIER_PALETTE.cheek,
  hair: MENU_CASHIER_PALETTE.hair,
  cloth: MENU_CASHIER_PALETTE.cloth,
  trim: MENU_CASHIER_PALETTE.trim,
  shirt: MENU_CASHIER_PALETTE.cream,
  width: 1.98,
  headWidth: 1.24,
  headHeight: 1.33,
  nose: [0.32, 0.31, 0.28] as Point,
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
  foldCenters: readonly number[] = [],
): THREE.BufferGeometry {
  if (
    points.length < 2 ||
    widths.length < 2 ||
    depths.length !== widths.length ||
    points.some((point) => ![point.x, point.y, point.z].every(Number.isFinite)) ||
    [...widths, ...depths].some((radius) => !Number.isFinite(radius) || radius <= 0) ||
    foldCenters.some((center) => !Number.isFinite(center) || center < 0 || center > 1)
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
  const sides = 20;
  for (let section = 0; section <= segments; section++) {
    const t = section / segments;
    const sample = t * (widths.length - 1);
    const index = Math.min(widths.length - 2, Math.floor(sample));
    const amount = sample - index;
    const width = THREE.MathUtils.lerp(widths[index], widths[index + 1], amount);
    const depth = THREE.MathUtils.lerp(depths[index], depths[index + 1], amount);
    const center = curve.getPointAt(t);
    const fold =
      section === 0 || section === segments
        ? 0
        : foldCenters.reduce((sum, center) => sum + Math.exp(-(((t - center) / 0.06) ** 2)), 0);
    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      const crease = Math.min(
        0.0045 * fold * (0.35 + 0.65 * (0.5 + 0.5 * Math.cos(angle - 0.6))),
        Math.min(width, depth) * 0.12,
      );
      const vertex = center
        .clone()
        .addScaledVector(frames.normals[section], Math.cos(angle) * (width - crease))
        .addScaledVector(frames.binormals[section], Math.sin(angle) * (depth - crease));
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

function softPatch(points: [number, number][], depth = 0.1, bevel = 0.065) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  for (const point of points.slice(1)) shape.lineTo(...point);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    steps: 1,
    curveSegments: 8,
  });
}

/** Rounded closed cloth edge; the caller owns the resulting geometry. */
function roundedCollar(points: [number, number][], calm = false) {
  const shape = new THREE.Shape();
  const corners = points.map((point, i) => {
    const center = new THREE.Vector2(...point);
    const previous = new THREE.Vector2(...points[(i + points.length - 1) % points.length]);
    const next = new THREE.Vector2(...points[(i + 1) % points.length]);
    const radius = Math.min(0.07, center.distanceTo(previous) * 0.3, center.distanceTo(next) * 0.3);
    return {
      center,
      entry: previous.sub(center).setLength(radius).add(center),
      exit: next.sub(center).setLength(radius).add(center),
    };
  });
  shape.moveTo(corners[0].entry.x, corners[0].entry.y);
  for (const { center, entry, exit } of corners) {
    shape.lineTo(entry.x, entry.y);
    shape.quadraticCurveTo(center.x, center.y, exit.x, exit.y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: calm ? 0.085 : 0.06,
    bevelEnabled: true,
    bevelSize: calm ? 0.05 : 0.04,
    bevelThickness: calm ? 0.05 : 0.04,
    bevelSegments: 3,
    steps: 1,
    curveSegments: 8,
  });
}

function characterFactory(parent: THREE.Group, calm = false) {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (
    color: string,
    roughness = calm
      ? color === CASHIER_STYLE.cloth
        ? 0.96
        : color === CASHIER_STYLE.hair
          ? 0.9
          : 0.94
      : color === CASHIER_STYLE.cloth
        ? 1
        : 0.94,
  ) => {
    const key = `${color}:${roughness}`;
    let result = materials.get(key);
    if (!result) {
      result = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness: 0,
      });
      result.name = `Кассирша: ${color}`;
      const role = Object.entries(MENU_CASHIER_PALETTE).find(([, value]) => value === color)?.[0];
      if (role) result.userData.menuCashierRole = role;
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
    bevel = 0.065,
  ) => mesh(softPatch(points, depth, bevel), color, position, target);
  return { mesh, round, oval, patch, material };
}

type Factory = ReturnType<typeof characterFactory>;

type FaceForm = ReturnType<typeof sculptedFace>;

/** The face is one closed surface; facial volumes are displacements of that surface. */
function sculptedFace(calm = false) {
  const style = CASHIER_STYLE;
  const w = style.headWidth;
  const h = style.headHeight;
  const exponent = 2.05;
  const profile = [
    [-1, 0, 0, 0],
    [-0.92, 0.36, 0.43, 0.34],
    [-0.76, calm ? 0.715 : 0.7, 0.67, 0.54],
    [-0.5, calm ? 0.935 : 0.91, 0.77, 0.74],
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
  const eyeX = w * 0.38;
  const eyeY = 0.065;
  const eyeWidth = calm ? 0.181 : 0.205;
  const eyeHeight = calm ? 0.172 : 0.205;
  const mouthY = (x: number) =>
    calm ? -0.865 + 0.145 * (x / 0.45) ** 2 + 0.024 * (x / 0.45) : -0.92 + 0.12 * (x / 0.38) ** 2;
  const noseWidth = style.nose[0] * 0.8256;
  const noseY = -0.28;
  const noseHeight = style.nose[1] * 0.6613;
  const displacement = (x: number, y: number) => {
    // Wide cheek and jaw fields overlap the muzzle instead of forming circular cheek objects.
    let result = 0.06 * gaussian(x, y, 0, -0.99, w * 0.56, 0.29);
    result += 0.045 * gaussian(x, y, 0, -0.6, 0.58, 0.31);
    for (const side of [-1, 1]) {
      result +=
        (calm ? (side < 0 ? 0.16 : 0.145) : 0.125) *
        gaussian(
          x,
          y,
          side * w * 0.56,
          calm ? -0.4 : -0.37,
          w * (calm ? 0.4 : 0.363),
          calm ? 0.4 : 0.35,
        );
      result += 0.055 * gaussian(x, y, side * w * 0.64, -0.05, w * 0.36, 0.4);
      result -= 0.09 * gaussian(x, y, side * eyeX, eyeY, 0.31, 0.235);
      const ex = (x - side * eyeX) / (eyeWidth * 1.12);
      const ey = (y - eyeY) / (eyeHeight * 1.34);
      const radius = Math.hypot(ex, ey);
      result += 0.035 * Math.exp(-(((radius - 1.05) / 0.26) ** 2));
      result += 0.06 * gaussian(x, y, side * eyeX, eyeY + 0.24, 0.38, 0.15);
    }
    if (calm) {
      result += 0.065 * gaussian(x, y, 0, 0.01, noseWidth * 0.66, 0.4);
      const nx = (Math.cos(0.28) * x + Math.sin(0.28) * (y + 0.32)) / 0.29;
      const ny = (-Math.sin(0.28) * x + Math.cos(0.28) * (y + 0.32)) / 0.205;
      result += 0.405 * Math.exp(-((nx * nx + ny * ny) ** 1.5));
      for (const side of [-1, 1])
        result += 0.045 * gaussian(x, y, side * 0.195, -0.39, 0.145, 0.12);
      result += 0.03 * gaussian(x, y, 0, -0.49, 0.12, 0.115);
    } else {
      // Bridge, broad tip, alae and columella all belong to the same skin mesh.
      result += 0.095 * gaussian(x, y, 0, 0.02, noseWidth * 0.69, 0.44);
      result += (style.nose[2] + 0.175) * gaussian(x, y, 0, noseY, noseWidth, noseHeight);
      for (const side of [-1, 1])
        result +=
          0.065 * gaussian(x, y, side * noseWidth * 0.7, noseY - 0.075, noseWidth * 0.57, 0.17);
      result += 0.055 * gaussian(x, y, 0, noseY - 0.19, noseWidth * 0.46, 0.15);
    }
    const lipY = mouthY(x);
    const lipMask = Math.exp(-((x / 0.39) ** 4));
    result +=
      lipMask *
      ((calm ? 0.045 : 0.035) * Math.exp(-(((y - lipY - 0.045) / (calm ? 0.08 : 0.06)) ** 2)));
    result +=
      lipMask *
      ((calm ? 0.05 : 0.038) * Math.exp(-(((y - lipY + 0.06) / (calm ? 0.095 : 0.075)) ** 2)));
    result -=
      lipMask * ((calm ? 0.008 : 0.022) * Math.exp(-(((y - lipY) / (calm ? 0.04 : 0.025)) ** 2)));
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
      0.24 *
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
  offset = 0.007,
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
      positions.push(x, y, face.front(x, y) + offset + height * (1 - u * u));
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

// Immutable CPU snapshots only; each bundle receives independent geometry attributes/index.
let fringeBlueprint:
  | {
      positions: Float32Array;
      normals: Float32Array;
      index: Uint16Array | Uint32Array;
    }
  | undefined;

let calmFringeBlueprint: typeof fringeBlueprint;

/** A closed curved fringe follows the forehead and crown instead of floating as a flat plate. */
function sweptFringe(face: FaceForm, calm = false): THREE.BufferGeometry {
  const blueprint = calm ? calmFringeBlueprint : fringeBlueprint;
  if (blueprint) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(blueprint.positions.slice(), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(blueprint.normals.slice(), 3));
    geometry.setIndex(new THREE.BufferAttribute(blueprint.index.slice(), 1));
    return geometry;
  }
  const shape = new THREE.Shape();
  if (calm) {
    shape.moveTo(-1.11, 0.26);
    shape.bezierCurveTo(-1.16, 0.77, -1.02, 1.38, -0.61, 1.58);
    shape.bezierCurveTo(-0.24, 1.6, 0.55, 1.57, 0.92, 1.3);
    shape.quadraticCurveTo(0.98, 1.07, 0.86, 1.03);
    shape.bezierCurveTo(0.52, 1.01, 0.12, 0.82, -0.14, 0.65);
    shape.bezierCurveTo(-0.43, 0.47, -0.56, 0.24, -0.83, 0.26);
    shape.quadraticCurveTo(-0.97, 0.28, -1.11, 0.26);
  } else {
    shape.moveTo(-1.08, 0.32);
    shape.bezierCurveTo(-1.12, 0.72, -1.05, 1.36, -0.61, 1.58);
    shape.bezierCurveTo(-0.27, 1.59, 0.53, 1.59, 0.92, 1.3);
    shape.quadraticCurveTo(0.98, 1.04, 0.86, 0.98);
    shape.bezierCurveTo(0.62, 0.93, 0.12, 0.95, -0.08, 0.88);
    shape.bezierCurveTo(-0.36, 0.69, -0.55, 0.24, -0.83, 0.27);
    shape.quadraticCurveTo(-0.96, 0.28, -1.08, 0.32);
  }
  shape.closePath();
  const extrusion = new THREE.ExtrudeGeometry(shape, {
    depth: calm ? 0.12 : 0.095,
    bevelEnabled: true,
    bevelSize: calm ? 0.018 : 0.03,
    bevelThickness: calm ? 0.018 : 0.03,
    bevelSegments: 4,
    steps: 1,
    curveSegments: 20,
  });
  // Bend a conforming cap mesh: neighbouring triangles share every new edge midpoint.
  // Independent recursive splits leave curved T-junction gaps after the forehead warp.
  const positionsOnly = new THREE.BufferGeometry();
  positionsOnly.setAttribute('position', extrusion.getAttribute('position').clone());
  extrusion.dispose();
  const indexed = mergeVertices(positionsOnly, 1e-5);
  positionsOnly.dispose();
  const source = indexed.getAttribute('position');
  const points = Array.from({ length: source.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(source, i),
  );
  type Triangle = [number, number, number];
  let triangles: Triangle[] = [];
  for (let i = 0; i < indexed.index!.count; i += 3)
    triangles.push([
      indexed.index!.getX(i),
      indexed.index!.getX(i + 1),
      indexed.index!.getX(i + 2),
    ]);
  indexed.dispose();
  // A numeric pair key avoids repeated coordinate strings while preserving shared topology.
  const edgeKey = (a: number, b: number) => {
    const high = Math.max(a, b);
    return (high * (high + 1)) / 2 + Math.min(a, b);
  };
  for (let pass = 0; pass < 5; pass++) {
    const edges = new Set<number>();
    for (const [a, b, c] of triangles) {
      const cap =
        Math.abs(points[a].z - points[b].z) < 1e-6 && Math.abs(points[a].z - points[c].z) < 1e-6;
      if (cap)
        for (const [u, v] of [
          [a, b],
          [b, c],
          [c, a],
        ])
          if (points[u].distanceToSquared(points[v]) > 0.16 ** 2) edges.add(edgeKey(u, v));
    }
    if (!edges.size) break;
    const refined: Triangle[] = [];
    const midpoints = new Map<number, number>();
    const split = (a: number, b: number, c: number) => {
      for (const [u, v, opposite] of [
        [a, b, c],
        [b, c, a],
        [c, a, b],
      ]) {
        const key = edgeKey(u, v);
        if (!edges.has(key)) continue;
        let middle = midpoints.get(key);
        if (middle === undefined) {
          middle = points.length;
          points.push(points[u].clone().lerp(points[v], 0.5));
          midpoints.set(key, middle);
        }
        split(u, middle, opposite);
        split(middle, v, opposite);
        return;
      }
      refined.push([a, b, c]);
    };
    for (const triangle of triangles) split(...triangle);
    triangles = refined;
  }
  const vertices = triangles.flatMap((triangle) => triangle.flatMap((i) => points[i].toArray()));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const positions = geometry.getAttribute('position');
  const surfaceZ = (x: number, y: number) => {
    const crown = 0.88 * Math.sqrt(Math.max(0, 1 - (x / 1.36) ** 2 - (y / 1.75) ** 2));
    return Math.max(face.front(x, y), crown) + 0.045;
  };
  let minZ = Infinity,
    maxZ = -Infinity;
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const x = positions.getX(vertex),
      y = positions.getY(vertex),
      z = positions.getZ(vertex);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    positions.setZ(vertex, surfaceZ(x, y) + z);
  }
  const smooth = mergeVertices(geometry, 1e-5);
  geometry.dispose();
  smooth.computeVertexNormals();
  // Curved caps use the authored surface derivative, independent of skinny triangulation.
  const p = smooth.getAttribute('position'),
    normals = smooth.getAttribute('normal');
  const normal = new THREE.Vector3(),
    epsilon = 0.0005;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i) - surfaceZ(x, y);
    const front = Math.abs(z - maxZ) < 1e-5,
      back = Math.abs(z - minZ) < 1e-5;
    if (!front && !back) continue;
    normal
      .set(
        -(surfaceZ(x + epsilon, y) - surfaceZ(x - epsilon, y)) / (2 * epsilon),
        -(surfaceZ(x, y + epsilon) - surfaceZ(x, y - epsilon)) / (2 * epsilon),
        1,
      )
      .normalize()
      .multiplyScalar(front ? 1 : -1);
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  const index = smooth.index!.array;
  const snapshot = {
    positions: new Float32Array(p.array),
    normals: new Float32Array(normals.array),
    index: index instanceof Uint16Array ? index.slice() : new Uint32Array(index),
  };
  if (calm) calmFringeBlueprint = snapshot;
  else fringeBlueprint = snapshot;
  return smooth;
}

function buildCashierHead(person: THREE.Group, factory: Factory, calm = false) {
  const style = CASHIER_STYLE;
  const { mesh, oval, round } = factory;
  const head = new THREE.Group();
  // Fit the broad head to the reference frame while retaining overlap with the neck.
  head.position
    .set(-0.12, 4.05, 0.04)
    .sub(MENU_NECK_PIVOT)
    .multiply(MENU_HEAD_SCALE)
    .add(MENU_NECK_PIVOT);
  head.position.y += MENU_HEAD_LIFT;
  head.scale.copy(MENU_HEAD_SCALE);
  head.rotation.set(-0.075, -0.4, 0.05);
  person.add(head);
  const w = style.headWidth;
  const h = style.headHeight;
  const face = sculptedFace(calm);
  const faceMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: calm ? 0.92 : 0.94,
    metalness: 0,
  });
  faceMaterial.name = 'Скульптура лица: ' + style.name;
  faceMaterial.userData.menuCashierRole = 'skin-face';
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
      MENU_CASHIER_PALETTE.eyeWhite,
      [0, 0, 0],
      head,
    );
    const pupilX = cx - side * 0.012;
    mesh(
      facePatch(face, [pupilX, cy - 0.009], [0.132, calm ? 0.14 : 0.154], 0.026),
      MENU_CASHIER_PALETTE.pupil,
      [0, 0, 0],
      head,
    );
    mesh(
      facePatch(face, [pupilX - 0.028, cy + 0.035], [0.024, 0.026], 0.036),
      MENU_CASHIER_PALETTE.eyeHighlight,
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
      MENU_CASHIER_PALETTE.lash,
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
        [0.015, 0.078, 0.075, 0.012],
        0.035,
      ),
      style.hair,
      [0, 0, 0],
      head,
    );
  }
  const mouthPoints: [number, number][] = (
    calm ? [-0.45, -0.225, 0, 0.225, 0.45] : [-0.38, -0.2, 0, 0.2, 0.38]
  ).map((x) => [x, face.mouthY(x)]);
  mesh(
    faceRibbon(
      face,
      mouthPoints,
      calm ? [0.003, 0.013, 0.016, 0.013, 0.003] : [0.005, 0.019, 0.023, 0.019, 0.005],
      calm ? 0.002 : 0.005,
      28,
      calm ? 0.012 : 0.007,
    ),
    MENU_CASHIER_PALETTE.smile,
    [0, 0, 0],
    head,
  );
  mesh(
    loft(
      [
        { y: -h * 0.76, width: w * 0.86, front: 0.17, back: 0.66, z: -0.29 },
        { y: -h * 0.45, width: w * 1.08, front: 0.29, back: 0.76, z: -0.29 },
        { y: h * 0.43, width: w * 1.09, front: 0.38, back: 0.85, z: -0.19 },
        { y: h * 0.81, width: w * 0.94, front: 0.57, back: 0.75, z: -0.11 },
        { y: h * 1.03, width: w * 0.62, front: 0.45, back: 0.5 },
        { y: h * 1.09, width: 0.04, front: 0.04 },
      ],
      2.2,
      48,
    ),
    style.hair,
    [0, 0, 0],
    head,
  );
  mesh(sweptFringe(face, calm), style.hair, [0, 0, 0], head);
  for (const side of [-1, 1])
    oval([0.22, 0.76, 0.28], style.hair, [side * w * 0.99, -0.08, 0.2], head);
  round([0.4, 0.16, 0.11], MENU_CASHIER_PALETTE.gold, [w * 0.77, h * 0.55, 0.77], head).rotation.z =
    -0.25;
}

function buildCashierClothes(person: THREE.Group, factory: Factory, calm = false) {
  const { mesh, round, oval, patch } = factory;
  const style = CASHIER_STYLE;
  const w = style.width;
  mesh(
    loft(
      [
        { y: -0.51, width: w * 0.46, front: 0.53, back: 0.55, z: -0.12 },
        { y: -0.24, width: w * 0.72, front: 0.76, back: 0.66, z: -0.13 },
        { y: 0.57, width: w * 0.9, front: 0.86, back: 0.7, z: -0.12 },
        {
          y: 1.47,
          width: w * (calm ? 1.02 : 1),
          front: calm ? 0.94 : 0.88,
          back: 0.74,
          z: -0.1,
        },
        {
          y: 2.42,
          width: w * (calm ? 1.075 : 0.99),
          front: calm ? 0.88 : 0.81,
          back: 0.69,
          z: -0.06,
        },
        {
          y: 3.125,
          width: w * (calm ? 1.06 : 0.97),
          front: calm ? 0.69 : 0.64,
          back: 0.53,
        },
        { y: 3.2, width: w * 0.67, front: 0.4, back: 0.37, z: 0.02 },
        { y: 3.25, width: 0.49, front: 0.34, back: 0.33, z: 0.03 },
      ],
      2.6,
    ),
    style.cloth,
  );
  oval([0.48, 0.5, 0.43], style.skin, [0, 2.98, 0.02]);
  patch(
    [
      [calm ? -0.4 : -0.34, 2.88],
      [calm ? 0.4 : 0.34, 2.88],
      [0.14, 0.8],
      [-0.14, 0.8],
    ],
    style.shirt,
    [0, 0, 0.79],
    person,
    0.07,
    0.035,
  );
  for (const side of [-1, 1]) {
    const lapel = patch(
      [
        [-0.12, 0.79],
        [0.36, 0.78],
        [0.85, 0.16],
        [0.42, -0.03],
        [0.35, -0.23],
        [-0.13, -0.07],
      ],
      style.trim,
      [side * 0.6, 2.28, 0.84],
      person,
      0.055,
      0.04,
    );
    if (side < 0) reflectGeometryX(lapel.geometry);
    lapel.rotation.y = side * 0.09;
    const collar = mesh(
      roundedCollar(
        calm
          ? [
              [-0.17, 0.23],
              [0.39, 0.37],
              [1.05, -0.05],
              [0.1, -0.47],
            ]
          : [
              [-0.13, 0.22],
              [0.35, 0.33],
              [0.9, -0.05],
              [0.15, -0.35],
            ],
        calm,
      ),
      style.shirt,
      [side * (calm ? 0.33 : 0.29), 2.97, 0.87],
      person,
    );
    if (side < 0) reflectGeometryX(collar.geometry);
  }
  for (const y of [1.14, 0.57])
    oval([0.055, 0.055, 0.04], MENU_CASHIER_PALETTE.gold, [0.13, y, 0.83]);
  round([0.66, 0.29, 0.08], style.trim, [-w * 0.58, 1.24, 0.81]).rotation.z = -0.08;
  oval(
    [calm ? 0.25 : 0.225, calm ? 0.23 : 0.19, calm ? 0.16 : 0.13],
    MENU_CASHIER_PALETTE.gold,
    [0, 2.79, 1.01],
  );
  for (const side of [-1, 1])
    oval([calm ? 0.43 : 0.36, calm ? 0.23 : 0.19, calm ? 0.18 : 0.14], MENU_CASHIER_PALETTE.gold, [
      side * (calm ? 0.3 : 0.26),
      2.74,
      0.96,
    ]).rotation.z = side * 0.17;
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
export function buildCashierUpperBody(calm = false): THREE.Group {
  const person = new THREE.Group();
  person.name = 'Статичный верх кассирши меню';
  const factory = characterFactory(person, calm);
  buildCashierClothes(person, factory, calm);
  buildCashierHead(person, factory, calm);
  consolidateUpperBody(person);
  return person;
}
