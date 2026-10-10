import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

type Point = readonly [number, number, number];
export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'little';
export type HandPose = {
  /** Thumb, index, middle, ring, little: 0 extends, 1 curls. */
  curl: readonly [number, number, number, number, number];
  spread?: readonly [number, number, number, number, number];
  thumbOpposition?: number;
  /** CMC flexion, abduction and adduction override for an authored thumb contact pose. */
  thumbBaseRotation?: Point;
  wrist?: Point;
  /** Radians at MCP/PIP/DIP; thumb uses CMC/MCP/IP. Each hinge is independently addressable. */
  flexion?: readonly [Point, Point, Point, Point, Point];
};
export type HandRig = {
  mesh: THREE.SkinnedMesh;
  skeleton: THREE.Skeleton;
  wrist: THREE.Bone;
  palm: THREE.Bone;
  fingers: Record<FingerName, readonly [THREE.Bone, THREE.Bone, THREE.Bone, THREE.Bone]>;
  side: -1 | 1;
  rest: ReadonlyMap<THREE.Bone, THREE.Quaternion>;
};
type Finger = { name: FingerName; points: readonly Point[]; radii: readonly number[] };
type Surface = { positions: Float32Array; normals: Float32Array };
type BindSurface = Surface & {
  skinIndices: Uint16Array;
  skinWeights: Float32Array;
  nails: Float32Array;
};

const digits: readonly Finger[] = [
  {
    name: 'thumb',
    points: [
      [-0.31, -0.15, 0.035],
      [-0.5, 0.08, 0.035],
      [-0.56, 0.27, 0.02],
      [-0.6, 0.43, 0.01],
    ],
    radii: [0.116, 0.099, 0.083, 0.071],
  },
  {
    name: 'index',
    points: [
      [-0.285, 0.21, 0],
      [-0.3, 0.49, -0.015],
      [-0.31, 0.69, -0.033],
      [-0.315, 0.845, -0.048],
    ],
    radii: [0.091, 0.085, 0.073, 0.062],
  },
  {
    name: 'middle',
    points: [
      [-0.075, 0.24, 0],
      [-0.075, 0.55, -0.013],
      [-0.076, 0.765, -0.033],
      [-0.077, 0.94, -0.05],
    ],
    radii: [0.095, 0.086, 0.075, 0.064],
  },
  {
    name: 'ring',
    points: [
      [0.132, 0.22, -0.005],
      [0.142, 0.51, -0.022],
      [0.149, 0.705, -0.042],
      [0.155, 0.875, -0.06],
    ],
    radii: [0.088, 0.081, 0.07, 0.06],
  },
  {
    name: 'little',
    points: [
      [0.318, 0.16, -0.015],
      [0.347, 0.385, -0.033],
      [0.363, 0.54, -0.052],
      [0.375, 0.675, -0.07],
    ],
    radii: [0.075, 0.068, 0.058, 0.05],
  },
];

export const HAND_POSES = {
  bind: { curl: [0, 0, 0, 0, 0], thumbOpposition: 0 },
  open: { curl: [0.025, 0.055, 0.045, 0.07, 0.09], thumbOpposition: 0.03 },
  relaxed: { curl: [0.16, 0.25, 0.29, 0.33, 0.38], thumbOpposition: 0.22 },
  grip: {
    curl: [0.42, 0.62, 0.66, 0.7, 0.74],
    thumbOpposition: 0.35,
  },
  card: {
    curl: [0, 0, 0, 0, 0],
    thumbBaseRotation: [0.24, -0.063, -0.1925],
    flexion: [
      [0, 0.12, 0.05],
      [0.08, 0.09, 0.06],
      [0.08, 0.09, 0.06],
      [0.09, 0.1, 0.07],
      [0.75, 1.15, 0.75],
    ],
  },
  fist: {
    curl: [0, 1, 1, 1, 1],
    thumbBaseRotation: [0.3, -0.1, -0.1],
    flexion: [
      [0, 0.8, 0.65],
      [1.25, 1.65, 1.1],
      [1.25, 1.65, 1.1],
      [1.25, 1.65, 1.1],
      [1.25, 1.65, 1.1],
    ],
  },
} satisfies Record<string, HandPose>;

// Rest surface is cached as CPU arrays only; every hand owns its GPU resources and skeleton.
let restSurface: Surface | undefined;
const bindSurfaces = new Map<-1 | 1, BindSurface>();
const handRigs = new WeakMap<THREE.Group, HandRig>();
const smoothstep = (a: number, b: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function segment(point: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  const rawT =
    ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy + (point[2] - a[2]) * dz) / (length * length);
  const t = THREE.MathUtils.clamp(rawT, 0, 1);
  return {
    t,
    rawT,
    length,
    distance: Math.hypot(
      point[0] - a[0] - t * dx,
      point[1] - a[1] - t * dy,
      (point[2] - a[2] - t * dz) * 1.08,
    ),
  };
}

function union(a: number, b: number, width: number) {
  const h = Math.max(width - Math.abs(a - b), 0) / width;
  return Math.min(a, b) - h * h * width * 0.25;
}

function ellipsoid(point: Point, center: Point, radii: Point) {
  const x = point[0] - center[0],
    y = point[1] - center[1],
    z = point[2] - center[2];
  const k0 = Math.hypot(x / radii[0], y / radii[1], z / radii[2]);
  const k1 = Math.hypot(x / radii[0] ** 2, y / radii[1] ** 2, z / radii[2] ** 2);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(...radii);
}

function createRestSurface(): Surface {
  if (restSurface) return restSurface;
  const resolution = 80,
    extent = 1.2;
  const material = new THREE.MeshBasicMaterial();
  const iso = new MarchingCubes(resolution, material, false, false, 24000);
  iso.isolation = 0;
  for (let iz = 0; iz < resolution; iz++) {
    const z = (iz / resolution - 0.5) * 2 * extent;
    for (let iy = 0; iy < resolution; iy++) {
      const y = (iy / resolution - 0.5) * 2 * extent;
      for (let ix = 0; ix < resolution; ix++) {
        const x = (ix / resolution - 0.5) * 2 * extent;
        const p: Point = [x, y, z];
        let d = ellipsoid(p, [0.015, -0.035, -0.014], [0.42, 0.365, 0.139]);
        d = union(d, ellipsoid(p, [-0.245, -0.12, 0.035], [0.175, 0.235, 0.137]), 0.09);
        const wrist = segment([x, y, z * 1.42], [0.018, -0.57, 0], [0.008, -0.25, 0]);
        d = union(d, wrist.distance - THREE.MathUtils.lerp(0.19, 0.245, wrist.t), 0.095);
        for (const digit of digits) {
          let finger = Infinity;
          for (let i = 0; i < 3; i++) {
            const sample = segment(p, digit.points[i], digit.points[i + 1]);
            finger = Math.min(
              finger,
              sample.distance - THREE.MathUtils.lerp(digit.radii[i], digit.radii[i + 1], sample.t),
            );
          }
          // Dorsal knuckles are part of the continuous skin, with supporting volume at each pivot.
          for (let i = 0; i < 3; i++) {
            const joint = digit.points[i];
            const radius = digit.radii[i];
            finger = union(
              finger,
              ellipsoid(
                p,
                [joint[0], joint[1], joint[2] - radius * 0.2],
                [radius * 1.06, radius * 0.85, radius * 0.96],
              ),
              0.014,
            );
          }
          const blendWidth =
            digit.name === 'thumb' ? 0.09 : 0.012 + 0.045 * (1 - smoothstep(0.21, 0.41, y));
          d = union(d, finger, blendWidth);
        }
        // Shallow flexion folds belong to the skin surface, not separate rings.
        if (z > 0.02 && y > 0.32) {
          for (const digit of digits.slice(1)) {
            for (const joint of digit.points.slice(1, 3)) {
              const across = Math.exp(-(((x - joint[0]) / 0.082) ** 4));
              const fold = Math.exp(-(((y - joint[1]) / 0.014) ** 2));
              d += 0.004 * across * fold * smoothstep(0.025, 0.055, z);
            }
          }
        }
        iso.field[ix + iy * resolution + iz * resolution * resolution] = -d;
      }
    }
  }
  iso.update();
  const count = iso.geometry.drawRange.count;
  const positions = new Float32Array(
    iso.geometry.getAttribute('position').array.slice(0, count * 3),
  );
  for (let i = 0; i < positions.length; i++) positions[i] *= extent;
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const welded = mergeVertices(source, 0.00001);
  const vertex = welded.getAttribute('position');
  const index = welded.getIndex()!;
  const neighbours = Array.from({ length: vertex.count }, () => new Set<number>());
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    for (const a of triangle) for (const b of triangle) if (a !== b) neighbours[a].add(b);
  }
  // Taubin smoothing removes extraction-grid corners while preserving hand volume and gaps.
  for (const amount of [0.4, -0.41, 0.4, -0.41]) {
    const previous = vertex.array.slice();
    for (let i = 0; i < vertex.count; i++) {
      const adjacent = neighbours[i];
      if (adjacent.size === 0) continue;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (const n of adjacent) sum += previous[n * 3 + c];
        vertex.setComponent(
          i,
          c,
          previous[i * 3 + c] + amount * (sum / adjacent.size - previous[i * 3 + c]),
        );
      }
    }
  }
  welded.computeVertexNormals();
  const smooth = welded.toNonIndexed();
  const result = {
    positions: new Float32Array(smooth.getAttribute('position').array),
    normals: new Float32Array(smooth.getAttribute('normal').array),
  };
  source.dispose();
  welded.dispose();
  smooth.dispose();
  iso.geometry.dispose();
  material.dispose();
  restSurface = result;
  return restSurface;
}

function createSkeleton(side: -1 | 1) {
  const wrist = new THREE.Bone();
  wrist.name = 'hand_wrist';
  wrist.position.set(0, -0.5, 0);
  const palm = new THREE.Bone();
  palm.name = 'hand_palm';
  palm.position.set(0, 0.5, 0);
  wrist.add(palm);
  const bones = [wrist, palm];
  const fingers = {} as HandRig['fingers'];
  const up = new THREE.Vector3(0, 1, 0);
  for (const digit of digits) {
    let parent: THREE.Bone = palm;
    let parentRotation = new THREE.Quaternion();
    let parentPoint = new THREE.Vector3();
    const chain: THREE.Bone[] = [];
    for (let i = 0; i < 4; i++) {
      const point = new THREE.Vector3(
        digit.points[i][0] * side,
        digit.points[i][1],
        digit.points[i][2],
      );
      const bone = new THREE.Bone();
      const joints = digit.name === 'thumb' ? ['cmc', 'mcp', 'ip'] : ['mcp', 'pip', 'dip'];
      bone.name = `hand_${digit.name}_${i === 3 ? 'tip' : joints[i]}`;
      bone.position.copy(point).sub(parentPoint).applyQuaternion(parentRotation.clone().invert());
      const next = digit.points[Math.min(i + 1, 3)];
      const direction =
        i === 3
          ? up.clone().applyQuaternion(parentRotation)
          : new THREE.Vector3(next[0] * side, next[1], next[2]).sub(point).normalize();
      const worldRotation = new THREE.Quaternion().setFromUnitVectors(up, direction);
      bone.quaternion.copy(parentRotation.clone().invert().multiply(worldRotation));
      parent.add(bone);
      bones.push(bone);
      chain.push(bone);
      parent = bone;
      parentRotation = worldRotation;
      parentPoint = point;
    }
    fingers[digit.name] = chain as unknown as HandRig['fingers'][FingerName];
  }
  return { wrist, palm, bones, fingers };
}

function assignWeights(point: Point, skeleton: ReturnType<typeof createSkeleton>) {
  let best: { digit: Finger; s: number; distance: number } | undefined;
  for (const digit of digits) {
    let length = 0;
    for (let i = 0; i < 3; i++) {
      const sample = segment(point, digit.points[i], digit.points[i + 1]);
      const distance =
        sample.distance - THREE.MathUtils.lerp(digit.radii[i], digit.radii[i + 1], sample.t);
      if (!best || distance < best.distance)
        best = {
          digit,
          s: length + sample.length * (i === 0 && sample.rawT < 0 ? sample.rawT : sample.t),
          distance,
        };
      length += sample.length;
    }
  }
  const wristWeight = 1 - smoothstep(-0.43, -0.18, point[1]);
  if (wristWeight > 0 || !best) {
    return { indices: [0, 1, 0, 0], weights: [wristWeight, 1 - wristWeight, 0, 0] };
  }
  const digit = best.digit;
  const firstLength = segment(digit.points[0], digit.points[0], digit.points[1]).length;
  const secondLength = segment(digit.points[1], digit.points[1], digit.points[2]).length;
  const thirdLength = segment(digit.points[2], digit.points[2], digit.points[3]).length;
  const rootInner = smoothstep(
    -digit.radii[0] * 0.25,
    digit.radii[0] * 0.4,
    point[2] - digit.points[0][2],
  );
  const rootWidth = THREE.MathUtils.lerp(
    digit.name === 'thumb' ? 0.095 : 0.07,
    Math.min(firstLength * 0.6, 0.15),
    rootInner,
  );
  const rootT = THREE.MathUtils.clamp((best.s + rootWidth) / (2 * rootWidth), 0, 1);
  const fingerAmount =
    THREE.MathUtils.lerp(rootT, smoothstep(0, 1, rootT), 0.1) *
    (digit.name === 'thumb' ? smoothstep(-0.17, -0.35, point[0]) : 1);
  const bendWeight = (joint: number, length: number, previous: number, next: number) => {
    const inner = smoothstep(
      -digit.radii[joint] * 0.25,
      digit.radii[joint] * 0.4,
      point[2] - digit.points[joint][2],
    );
    const short = Math.min(digit.radii[joint] * 0.65, Math.min(previous, next) * 0.23);
    const width = THREE.MathUtils.lerp(short, Math.min(previous, next) * 0.65, inner);
    const t = THREE.MathUtils.clamp((best.s - length + width) / (2 * width), 0, 1);
    return THREE.MathUtils.lerp(t, smoothstep(0, 1, t), 0.1);
  };
  const pip = bendWeight(1, firstLength, firstLength, secondLength);
  const dip = bendWeight(2, firstLength + secondLength, secondLength, thirdLength);
  const chain = skeleton.fingers[best.digit.name];
  const baseIndices = [1, ...chain.slice(0, 3).map((bone) => skeleton.bones.indexOf(bone))];
  const baseWeights = [
    1 - fingerAmount,
    fingerAmount * (1 - pip),
    fingerAmount * pip * (1 - dip),
    fingerAmount * pip * dip,
  ];
  // Webbing shares neighbouring metacarpal motion; a nearest-finger seam cannot remain rigid.
  const rootBlend = Math.max(
    ...digits.map(
      (candidate) =>
        1 -
        smoothstep(
          0.165,
          0.28,
          Math.hypot(
            point[0] - candidate.points[0][0],
            point[1] - candidate.points[0][1],
            point[2] - candidate.points[0][2],
          ),
        ),
    ),
  );
  if (rootBlend > 0) {
    const roots = digits.map((candidate) => {
      const sample = segment(point, candidate.points[0], candidate.points[1]);
      const support =
        (1 - smoothstep(candidate.radii[0] * 0.75, candidate.radii[0] * 2.5, sample.distance)) *
        (candidate.name === 'thumb' ? smoothstep(-0.17, -0.35, point[0]) : 1);
      const t = THREE.MathUtils.clamp((sample.rawT * sample.length + 0.15) / 0.3, 0, 1);
      return {
        bone: skeleton.bones.indexOf(skeleton.fingers[candidate.name][0]),
        support,
        amount: THREE.MathUtils.lerp(t, smoothstep(0, 1, t), 0.1),
      };
    });
    const support = roots.reduce((sum, root) => sum + root.support, 0);
    if (support > 0) {
      const combined = new Map<number, number>();
      baseIndices.forEach((bone, i) =>
        combined.set(
          bone,
          (combined.get(bone) ?? 0) + baseWeights[i] * (i < 2 ? 1 - rootBlend : 1),
        ),
      );
      const rootMass = baseWeights[0] + baseWeights[1];
      let palm = 0;
      for (const root of roots) {
        const amount = (root.support / support) * rootBlend * rootMass;
        combined.set(root.bone, (combined.get(root.bone) ?? 0) + amount * root.amount);
        palm += amount * (1 - root.amount);
      }
      combined.set(1, (combined.get(1) ?? 0) + palm);
      const strongest = [...combined].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = strongest.reduce((sum, [, weight]) => sum + weight, 0);
      while (strongest.length < 4) strongest.push([0, 0]);
      return {
        indices: strongest.map(([bone]) => bone),
        weights: strongest.map(([, weight]) => weight / total),
      };
    }
  }
  return {
    indices: baseIndices,
    // Compact dorsal hinges; thicker palmar skin needs a wider finite contact band when folded.
    weights: baseWeights,
  };
}

function poseRotations(rig: HandRig, pose: HandPose) {
  const result = new Map<THREE.Bone, THREE.Quaternion>();
  const rotate = (bone: THREE.Bone, x: number, y = 0, z = 0) =>
    result.set(
      bone,
      rig.rest
        .get(bone)!
        .clone()
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z))),
    );
  const wrist: Point = pose.wrist ?? [0, 0, 0];
  rotate(
    rig.wrist,
    THREE.MathUtils.clamp(wrist[0], -0.65, 0.8),
    THREE.MathUtils.clamp(wrist[1], -0.25, 0.25) * rig.side,
    THREE.MathUtils.clamp(wrist[2], -0.3, 0.35) * rig.side,
  );
  rotate(rig.palm, 0);
  const opposition = THREE.MathUtils.clamp(pose.thumbOpposition ?? 0, 0, 1);
  digits.forEach((digit, i) => {
    const curl = THREE.MathUtils.clamp(pose.curl[i], 0, 1);
    const spread =
      THREE.MathUtils.clamp(pose.spread?.[i] ?? 0, -0.2, 0.2) * rig.side * (1 - curl * 0.75);
    const requested = pose.flexion?.[i];
    const chain = rig.fingers[digit.name];
    if (digit.name === 'thumb') {
      const base = pose.thumbBaseRotation;
      rotate(
        chain[0],
        THREE.MathUtils.clamp(
          base?.[0] ??
            opposition * 0.55 + THREE.MathUtils.clamp(requested?.[0] ?? curl * 0.16, 0, 0.4),
          0,
          0.95,
        ),
        THREE.MathUtils.clamp(base?.[1] ?? -opposition * 0.18, -0.3, 0.3) * rig.side,
        base
          ? THREE.MathUtils.clamp(base[2], -1.1, 0.2) * rig.side
          : spread - opposition * 0.55 * rig.side,
      );
      rotate(chain[1], THREE.MathUtils.clamp(requested?.[1] ?? curl * 0.9, 0, 1.1));
      rotate(chain[2], THREE.MathUtils.clamp(requested?.[2] ?? curl * 0.85, 0, 1.25));
    } else {
      // +X takes the +Y phalanges towards the +Z palm; IP hinges never twist or bend sideways.
      rotate(chain[0], THREE.MathUtils.clamp(requested?.[0] ?? curl * 1.25, 0, 1.25), 0, spread);
      rotate(chain[1], THREE.MathUtils.clamp(requested?.[1] ?? curl * 1.65, 0, 1.85));
      rotate(chain[2], THREE.MathUtils.clamp(requested?.[2] ?? curl * 1.1, 0, 1.3));
    }
    rotate(chain[3], 0);
  });
  return result;
}

export function getHandRig(hand: THREE.Group): HandRig | undefined {
  return handRigs.get(hand);
}

/** Bone transforms deform one rest mesh; no rebuilding or pose-mesh swapping. */
export function setHandPose(hand: THREE.Group, pose: HandPose | keyof typeof HAND_POSES) {
  const rig = handRigs.get(hand);
  if (!rig) throw new Error('Hand has no rig');
  const rotations = poseRotations(rig, typeof pose === 'string' ? HAND_POSES[pose] : pose);
  for (const [bone, rotation] of rotations) bone.quaternion.copy(rotation);
  hand.updateMatrixWorld(true);
  rig.skeleton.update();
}

/** Ready for THREE.AnimationMixer(hand).update(dt), with each finger and wrist addressable. */
export function createHandAnimation(
  hand: THREE.Group,
  keyframes: readonly { time: number; pose: HandPose | keyof typeof HAND_POSES }[],
  name = 'hand gesture',
) {
  const rig = handRigs.get(hand);
  if (!rig) throw new Error('Hand has no rig');
  if (
    keyframes.length < 2 ||
    keyframes.some(
      (frame, i) =>
        !Number.isFinite(frame.time) ||
        frame.time < 0 ||
        (i > 0 && frame.time <= keyframes[i - 1].time),
    )
  )
    throw new Error('Hand animation requires increasing, finite keyframe times');
  const samples = keyframes.map((frame) =>
    poseRotations(rig, typeof frame.pose === 'string' ? HAND_POSES[frame.pose] : frame.pose),
  );
  const tracks: THREE.KeyframeTrack[] = rig.skeleton.bones.map(
    (bone) =>
      new THREE.QuaternionKeyframeTrack(
        `${bone.uuid}.quaternion`,
        keyframes.map((frame) => frame.time),
        samples.flatMap((sample) => sample.get(bone)!.toArray()),
      ),
  );
  return new THREE.AnimationClip(name, keyframes[keyframes.length - 1].time, tracks);
}

function createBindSurface(side: -1 | 1, skeleton: ReturnType<typeof createSkeleton>): BindSurface {
  const cached = bindSurfaces.get(side);
  if (cached) return cached;
  const surface = createRestSurface();
  const positions = surface.positions.slice(),
    normals = surface.normals.slice();
  if (side === -1) {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] *= -1;
      normals[i] *= -1;
    }
    for (const attribute of [positions, normals]) {
      for (let i = 0; i < attribute.length; i += 9)
        for (let c = 0; c < 3; c++) {
          const value = attribute[i + 3 + c];
          attribute[i + 3 + c] = attribute[i + 6 + c];
          attribute[i + 6 + c] = value;
        }
    }
  }
  const skinIndices = new Uint16Array((positions.length / 3) * 4),
    skinWeights = new Float32Array((positions.length / 3) * 4),
    nails = new Float32Array(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    const point: Point = [positions[i] * side, positions[i + 1], positions[i + 2]];
    const weights = assignWeights(point, skeleton);
    skinIndices.set(weights.indices, (i / 3) * 4);
    skinWeights.set(weights.weights, (i / 3) * 4);
    let nail = 0;
    for (const digit of digits) {
      const tip = digit.points[3];
      if (point[2] < tip[2] - 0.02)
        nail = Math.max(
          nail,
          (1 -
            smoothstep(
              0.65,
              1,
              Math.hypot(
                (point[0] - tip[0]) / (digit.radii[3] * 0.75),
                (point[1] - tip[1] + 0.035) / 0.067,
              ),
            )) *
            smoothstep(0.02, 0.055, tip[2] - point[2]),
        );
    }
    nails[i / 3] = nail;
  }
  const result = { positions, normals, skinIndices, skinWeights, nails };
  bindSurfaces.set(side, result);
  return result;
}

/** +y fingers, +z palm; thumb points inward. Both sides have independent 22-bone rigs. */
export function buildCartoonHand(skin: string, side: -1 | 1, grip = true): THREE.Group {
  const skeleton = createSkeleton(side);
  const surface = createBindSurface(side, skeleton);
  const colors = new Float32Array(surface.positions.length);
  const skinColor = new THREE.Color(skin),
    nailColor = new THREE.Color(skin).lerp(new THREE.Color('#efcfbf'), 0.24);
  for (let i = 0; i < surface.nails.length; i++) {
    const nail = surface.nails[i];
    colors[i * 3] = THREE.MathUtils.lerp(skinColor.r, nailColor.r, nail);
    colors[i * 3 + 1] = THREE.MathUtils.lerp(skinColor.g, nailColor.g, nail);
    colors[i * 3 + 2] = THREE.MathUtils.lerp(skinColor.b, nailColor.b, nail);
  }
  const geometry = new THREE.BufferGeometry();
  // Cached bind data stays on the CPU. No attributes, skeletons or GPU resources are shared.
  geometry.setAttribute('position', new THREE.BufferAttribute(surface.positions.slice(), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(surface.normals.slice(), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(surface.skinIndices.slice(), 4),
  );
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(surface.skinWeights.slice(), 4),
  );
  const mesh = new THREE.SkinnedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.76, metalness: 0 }),
  );
  mesh.name = 'continuous anatomical hand';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  // Finger and wrist rotations stay inside this conservative local bound.
  // Updating a pose never needs a CPU skinning pass over the full surface.
  mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-2, -2, -2), new THREE.Vector3(2, 2, 2));
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
  mesh.add(skeleton.wrist);
  mesh.updateMatrixWorld(true);
  const binding = new THREE.Skeleton(skeleton.bones);
  mesh.bind(binding);
  const group = new THREE.Group();
  group.name = grip ? 'Rigged card hand' : 'Rigged open hand';
  group.add(mesh);
  handRigs.set(group, {
    mesh,
    skeleton: binding,
    wrist: skeleton.wrist,
    palm: skeleton.palm,
    fingers: skeleton.fingers,
    side,
    rest: new Map(skeleton.bones.map((bone) => [bone, bone.quaternion.clone()])),
  });
  setHandPose(group, grip ? 'grip' : 'open');
  return group;
}
