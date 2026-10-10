import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PublicPlayer } from '../shared/types';
import { buildCartoonHand } from './cartoon-hands';

type Point = [number, number, number];
type Ring = { y: number; width: number; front: number; back?: number; z?: number };
type CharacterStyle = {
  name: string;
  skin: string;
  cheek: string;
  hair: string;
  cloth: string;
  trim: string;
  shirt: string;
  width: number;
  headWidth: number;
  headHeight: number;
  nose: Point;
};

const styles: CharacterStyle[] = [
  {
    name: 'Начальник станции',
    skin: '#d6a57f',
    cheek: '#d49475',
    hair: '#a6a69b',
    cloth: '#334e68',
    trim: '#213a50',
    shirt: '#e6d7b7',
    width: 1.88,
    headWidth: 1.29,
    headHeight: 1.42,
    nose: [0.4, 0.34, 0.47],
  },
  {
    name: 'Билетная кассирша',
    skin: '#edbb96',
    cheek: '#df9f87',
    hair: '#563e32',
    cloth: '#974a52',
    trim: '#71363e',
    shirt: '#efe0c6',
    width: 1.66,
    headWidth: 1.24,
    headHeight: 1.33,
    nose: [0.3, 0.31, 0.37],
  },
  {
    name: 'Путеец',
    skin: '#aa7555',
    cheek: '#a36c50',
    hair: '#362e28',
    cloth: '#60796b',
    trim: '#3e584c',
    shirt: '#cbb78b',
    width: 2.02,
    headWidth: 1.39,
    headHeight: 1.34,
    nose: [0.44, 0.32, 0.46],
  },
  {
    name: 'Проводник',
    skin: '#d9aa84',
    cheek: '#c99171',
    hair: '#39342d',
    cloth: '#bb8748',
    trim: '#8d6137',
    shirt: '#dce1cf',
    width: 1.71,
    headWidth: 1.17,
    headHeight: 1.46,
    nose: [0.34, 0.38, 0.42],
  },
];

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

function curvedVolume(points: Point[], widths: number[], depths = widths, segments = 20) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
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

function buildHead(person: THREE.Group, style: CharacterStyle, kind: number, factory: Factory) {
  const { mesh, oval, round, patch } = factory;
  const head = new THREE.Group();
  head.position.set(kind === 1 ? -0.07 : 0.03, 4.05, 0.04);
  head.rotation.set(
    -0.075,
    kind === 1 ? -0.055 : kind === 3 ? 0.065 : 0,
    kind === 1 ? 0.05 : -0.02,
  );
  person.add(head);
  const w = style.headWidth;
  const h = style.headHeight;
  mesh(
    loft(
      [
        { y: -h, width: w * 0.18, front: 0.27, back: 0.3 },
        { y: -h * 0.86, width: w * 0.58, front: 0.61, back: 0.56 },
        { y: -h * 0.58, width: w * 0.86, front: 0.78, back: 0.72 },
        { y: -h * 0.23, width: w, front: 0.85, back: 0.85 },
        { y: h * 0.18, width: w * 1.02, front: 0.82, back: 0.92 },
        { y: h * 0.53, width: w * 0.95, front: 0.76, back: 0.86 },
        { y: h * 0.8, width: w * 0.73, front: 0.59, back: 0.65 },
        { y: h * 0.96, width: w * 0.35, front: 0.31, back: 0.36 },
        { y: h, width: 0.035, front: 0.035 },
      ],
      kind === 2 ? 2.7 : 2.35,
    ),
    style.skin,
    [0, 0, 0],
    head,
  );
  for (const side of [-1, 1]) {
    oval([0.26, 0.41, 0.28], style.skin, [side * w * 1.02, -0.02, -0.02], head);
    oval([0.13, 0.24, 0.07], style.cheek, [side * w * 1.085, -0.01, 0.21], head);
    oval([0.33, 0.27, 0.16], style.cheek, [side * w * 0.62, -0.37, 0.72], head);
    // Small matte eyes sit below broad brows, leaving the nose as the main facial volume.
    oval([0.15, kind === 1 ? 0.2 : 0.16, 0.085], '#292d2e', [side * w * 0.4, 0.16, 0.822], head);
    const brow = mesh(
      curvedVolume(
        [
          [-0.34, 0, 0],
          [-0.2, 0.085, 0.025],
          [0.12, 0.07, 0.02],
          [0.33, -0.025, 0],
        ],
        [0.075, kind === 2 ? 0.16 : 0.12, 0.12, 0.065],
        [0.07, 0.1, 0.1, 0.06],
        12,
      ),
      style.hair,
      [side * w * 0.42, 0.42, 0.87],
      head,
    );
    brow.rotation.z = side * (kind === 1 ? 0.1 : kind === 2 ? -0.16 : -0.04);
  }
  oval(style.nose, style.skin, [0, -0.13, 1.055], head);
  const smile = kind === 1 || kind === 3;
  mesh(
    curvedVolume(
      [
        [-0.3, smile ? 0.025 : 0, 0],
        [0, smile ? -0.07 : -0.025, 0.03],
        [0.3, 0.025, 0],
      ],
      [0.026, 0.042, 0.025],
      [0.025, 0.03, 0.025],
      12,
    ),
    '#745041',
    [0, -0.68, 0.79],
    head,
  );
  if (kind === 0 || kind === 2) {
    for (const side of [-1, 1]) {
      const moustache = oval(
        [kind === 0 ? 0.48 : 0.36, kind === 0 ? 0.21 : 0.18, 0.19],
        style.hair,
        [side * 0.33, -0.48, 0.99],
        head,
      );
      moustache.rotation.z = side * -0.15;
    }
    if (kind === 0) {
      for (const side of [-1, 1])
        oval([0.21, 0.48, 0.18], style.hair, [side * w * 0.88, -0.48, 0.42], head);
      mesh(
        loft(
          [
            { y: h * 0.67, width: w * 0.92, front: 0.77, back: 0.84 },
            { y: h * 0.82, width: w * 1.05, front: 0.82, back: 0.92 },
            { y: h * 1.05, width: w, front: 0.78, back: 0.86 },
            { y: h * 1.2, width: w * 0.73, front: 0.55, back: 0.64 },
            { y: h * 1.24, width: 0.05, front: 0.05 },
          ],
          2.7,
        ),
        style.cloth,
        [0, 0, -0.08],
        head,
      );
      round([w * 1.93, 0.16, 0.17], style.trim, [0, h * 0.72, 0.73], head);
      oval([1.03, 0.13, 0.5], style.trim, [0, h * 0.67, 0.73], head).rotation.x = -0.08;
      round([0.39, 0.28, 0.085], '#d3b578', [0, h * 0.9, 0.76], head);
    } else {
      mesh(
        loft(
          [
            { y: h * 0.65, width: w * 0.88, front: 0.72, back: 0.84 },
            { y: h * 0.86, width: w * 1.02, front: 0.79, back: 0.9 },
            { y: h * 1.05, width: w * 0.93, front: 0.66, back: 0.76 },
            { y: h * 1.13, width: w * 0.48, front: 0.38, back: 0.43 },
            { y: h * 1.16, width: 0.035, front: 0.035 },
          ],
          2.4,
        ),
        '#896d4c',
        [0, 0, -0.1],
        head,
      );
      oval([0.87, 0.12, 0.43], '#6c543e', [0, h * 0.65, 0.72], head);
      oval([0.41, 0.23, 0.14], style.hair, [0, -1.04, 0.52], head);
    }
  } else if (kind === 1) {
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
  } else {
    mesh(
      loft([
        { y: h * 0.49, width: w * 0.95, front: 0.25, back: 0.76, z: -0.18 },
        { y: h * 0.79, width: w * 1.04, front: 0.63, back: 0.84, z: -0.06 },
        { y: h * 1.08, width: w * 0.83, front: 0.62, back: 0.68 },
        { y: h * 1.24, width: w * 0.42, front: 0.39, back: 0.35, z: 0.14 },
        { y: h * 1.28, width: 0.04, front: 0.04, z: 0.19 },
      ]),
      style.hair,
      [0, 0, 0],
      head,
    );
    oval([0.71, 0.39, 0.31], style.hair, [-0.35, h * 0.83, 0.7], head).rotation.z = -0.27;
  }
}

function buildClothes(person: THREE.Group, style: CharacterStyle, kind: number, factory: Factory) {
  const { mesh, round, oval, patch } = factory;
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
    kind === 2 ? style.shirt : style.cloth,
  );
  oval([0.48, 0.5, 0.43], style.skin, [0, 2.98, 0.02]);
  if (kind === 2) {
    round([2.28, 2.15, 0.17], style.cloth, [0, 1.13, 0.77]);
    for (const side of [-1, 1]) {
      round([0.28, 1.73, 0.16], style.cloth, [side * 0.89, 2.15, 0.72]).rotation.z = side * -0.12;
      oval([0.115, 0.115, 0.07], '#d6b577', [side * 0.91, 1.86, 0.91]);
    }
    round([0.83, 0.6, 0.09], style.trim, [0, 1.3, 0.89]);
  } else {
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
      lapel.scale.x = side;
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
      collar.scale.x = side;
    }
    for (const y of [1.14, 0.57]) oval([0.085, 0.085, 0.06], '#ccb477', [0.13, y, 0.83]);
    round([0.66, 0.29, 0.08], style.trim, [-w * 0.58, 1.24, 0.81]).rotation.z = -0.08;
    if (kind === 1) {
      oval([0.25, 0.21, 0.13], '#b79361', [0, 2.59, 1.01]);
      for (const side of [-1, 1])
        oval([0.36, 0.22, 0.14], '#b79361', [side * 0.26, 2.54, 0.96]).rotation.z = side * 0.17;
    } else if (kind === 3) round([0.26, 1.36, 0.11], '#476b6a', [0, 2.04, 0.94]).rotation.z = 0.065;
  }
}

function attachHand(
  person: THREE.Group,
  style: CharacterStyle,
  side: -1 | 1,
  position: Point,
  rotation: Point,
  grip: boolean,
  factory: Factory,
) {
  const hand = buildCartoonHand(style.skin, side, grip);
  hand.name = grip ? 'Кисть с картами' : 'Открытая кисть';
  hand.position.set(...position);
  hand.rotation.set(...rotation);
  hand.scale.setScalar(1.04);
  // Both hands use the same skin material so they consolidate into one static draw call.
  const replaced = new Set<THREE.Material>();
  hand.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    replaced.add(object.material);
    object.material = factory.material(style.skin, 0.88);
  });
  replaced.forEach((material) => material.dispose());
  person.add(hand);
  hand.updateMatrix();
  const wrist = new THREE.Vector3(0, -0.5, 0).applyMatrix4(hand.matrix);
  return { hand, wrist };
}

function buildCards(hand: THREE.Group, count: number, texture: THREE.Texture, factory: Factory) {
  const fan = new THREE.Group();
  fan.name = 'Веер рубашек карт';
  hand.add(fan);
  const paper = factory.material('#d5c6a6');
  const back = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 });
  const geometry = new THREE.BoxGeometry(0.82, 1.4, 0.034);
  geometry.translate(0, 0.7, 0);
  for (let index = 0; index < count; index++) {
    const spread = index - (count - 1) / 2;
    const card = new THREE.Mesh(geometry, [paper, paper, paper, paper, back, back]);
    card.name = 'Закрытая карта';
    card.position.set(spread * 0.055, -0.14 + Math.abs(spread) * 0.014, 0.145 - index * 0.016);
    card.rotation.z = -spread * 0.175;
    card.castShadow = true;
    card.receiveShadow = true;
    fan.add(card);
  }
}

function consolidateCharacter(person: THREE.Group) {
  person.updateMatrixWorld(true);
  const inverseRoot = person.matrixWorld.clone().invert();
  const buckets = new Map<
    THREE.Material,
    { geometry: THREE.BufferGeometry; object: THREE.Mesh }[]
  >();
  person.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    if (!(object.material instanceof THREE.MeshStandardMaterial) || object.material.map) return;
    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    for (const key of Object.keys(geometry.attributes))
      if (key !== 'position' && key !== 'normal') geometry.deleteAttribute(key);
    const transform = inverseRoot.clone().multiply(object.matrixWorld);
    geometry.applyMatrix4(transform);
    if (transform.determinant() < 0) {
      for (const key of ['position', 'normal']) {
        const attribute = geometry.getAttribute(key) as THREE.BufferAttribute;
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
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    person.add(mesh);
    for (const { object } of entries) {
      obsolete.add(object.geometry);
      object.removeFromParent();
    }
  }
  obsolete.forEach((geometry) => geometry.dispose());
}

/** Original railway characters show public hand counts through a shared printed back. */
export function buildDispatcher(
  parent: THREE.Group,
  player: PublicPlayer,
  x: number,
  z: number,
  index: number,
  cardBack: THREE.Texture | null,
) {
  const kind = index % styles.length;
  const style = styles[kind];
  const person = new THREE.Group();
  person.name = style.name;
  person.position.set(x, -1.28, z);
  person.rotation.y = Math.atan2(-x, -z);
  parent.add(person);
  const factory = characterFactory(person);
  const { mesh, round, oval } = factory;
  round([4.4, 0.32, 2.15], '#445351', [0, -0.38, -0.4]);
  for (const side of [-1, 1]) round([0.2, 3.92, 0.23], '#445351', [side * 1.76, 1.32, -1.23]);
  round([3.76, 0.42, 0.27], '#52605a', [0, 2.84, -1.23]);
  round([3.76, 0.3, 0.27], '#445351', [0, 1.12, -1.23]);
  buildClothes(person, style, kind, factory);
  buildHead(person, style, kind, factory);
  round([0.67, 0.42, 0.07], '#ddc28a', [style.width * 0.55, 2.13, 0.76]).rotation.y = 0.12;
  round([0.5, 0.26, 0.08], player.color, [style.width * 0.55, 2.13, 0.807]).rotation.y = 0.12;
  const hasCards = player.handCount > 0 && cardBack !== null;
  const cardHand = attachHand(
    person,
    style,
    -1,
    [-0.83, 0.84, 2.73],
    [-0.1, 0.045, -0.1],
    hasCards,
    factory,
  );
  const openHand = attachHand(
    person,
    style,
    1,
    [1.27, 0.72, 2.83],
    [0.18, -0.09, -0.28],
    false,
    factory,
  );
  for (const [side, attachment] of [
    [-1, cardHand],
    [1, openHand],
  ] as const) {
    const shoulder: Point = [side * style.width * 0.8, 2.38, -0.04];
    const elbow: Point = [side * (style.width + 0.32), 0.75, 1.32];
    const wrist = attachment.wrist;
    mesh(
      curvedVolume(
        [shoulder, [side * (style.width + 0.05), 1.96, 0.42], elbow, [wrist.x, wrist.y, wrist.z]],
        [0.67, 0.65, 0.48, 0.27],
        [0.61, 0.59, 0.43, 0.25],
      ),
      kind === 2 || kind === 3 ? style.shirt : style.cloth,
    );
    const cuffStart = new THREE.Vector3(...elbow).lerp(wrist, 0.86);
    mesh(
      curvedVolume(
        [
          [cuffStart.x, cuffStart.y, cuffStart.z],
          [wrist.x, wrist.y, wrist.z],
        ],
        [0.31, 0.29],
        [0.28, 0.26],
        6,
      ),
      kind === 2 || kind === 3 ? style.cloth : style.trim,
    );
    oval([0.31, 0.14, 0.09], style.trim, [elbow[0], elbow[1] + 0.15, elbow[2] + 0.39]).rotation.z =
      side * -0.15;
  }
  if (hasCards) buildCards(cardHand.hand, Math.min(5, player.handCount), cardBack, factory);
  consolidateCharacter(person);
  return person;
}
