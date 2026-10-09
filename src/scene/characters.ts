import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PublicPlayer } from '../shared/types';

type Point = [number, number, number];
type Ring = { y: number; width: number; front: number; back?: number; z?: number; x?: number };
type CharacterStyle = {
  skin: string;
  skinShadow: string;
  hair: string;
  cloth: string;
  clothShadow: string;
  shirt: string;
  width: number;
  headWidth: number;
  headHeight: number;
  headY: number;
};

const styles: CharacterStyle[] = [
  {
    skin: '#b88b6c',
    skinShadow: '#95694f',
    hair: '#878579',
    cloth: '#384b50',
    clothShadow: '#29393d',
    shirt: '#c6bba1',
    width: 2.48,
    headWidth: 1.12,
    headHeight: 2.12,
    headY: 4.2,
  },
  {
    skin: '#c9a185',
    skinShadow: '#a5785f',
    hair: '#302c28',
    cloth: '#526b65',
    clothShadow: '#304b48',
    shirt: '#9da68c',
    width: 1.91,
    headWidth: 0.89,
    headHeight: 2.4,
    headY: 4.27,
  },
  {
    skin: '#86654e',
    skinShadow: '#684937',
    hair: '#3a322b',
    cloth: '#77704a',
    clothShadow: '#414e3d',
    shirt: '#b6a17c',
    width: 2.77,
    headWidth: 1.15,
    headHeight: 2.2,
    headY: 4.0,
  },
];

// Continuous sections describe the silhouette; flat normals make the large planes legible.
function loft(rings: Ring[], sides = 12) {
  const positions: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const cosine = Math.cos(angle);
      positions.push(
        Math.sin(angle) * ring.width + (ring.x ?? 0),
        ring.y,
        (cosine >= 0
          ? Math.min(cosine * 1.12, 1) * ring.front
          : cosine * (ring.back ?? ring.front)) + (ring.z ?? 0),
      );
    }
  }
  const indices: number[] = [];
  for (let level = 0; level < rings.length - 1; level++) {
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      const a = level * sides + i,
        b = level * sides + next;
      const c = (level + 1) * sides + next,
        d = (level + 1) * sides + i;
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
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  return faceted;
}

function outline(points: [number, number][], depth = 0.055) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  points.slice(1).forEach((point) => shape.lineTo(...point));
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
}

function bentVolume(points: Point[], widths: number[], depths: number[]) {
  const positions: number[] = [],
    indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const sections = points.map((point) => new THREE.Vector3(...point));
  for (let i = 0; i < sections.length; i++) {
    const before = sections[Math.max(0, i - 1)],
      after = sections[Math.min(sections.length - 1, i + 1)];
    const tangent = after.clone().sub(before).normalize();
    const horizontal = new THREE.Vector3().crossVectors(up, tangent).normalize();
    if (horizontal.lengthSq() < 0.1) horizontal.set(1, 0, 0);
    const vertical = new THREE.Vector3().crossVectors(tangent, horizontal).normalize();
    for (let s = 0; s < 8; s++) {
      const angle = (s * Math.PI) / 4;
      const vertex = sections[i]
        .clone()
        .addScaledVector(horizontal, Math.cos(angle) * widths[i])
        .addScaledVector(vertical, Math.sin(angle) * depths[i]);
      positions.push(vertex.x, vertex.y, vertex.z);
    }
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let s = 0; s < 8; s++) {
      const next = (s + 1) % 8;
      const a = i * 8 + s,
        b = i * 8 + next,
        c = (i + 1) * 8 + next,
        d = (i + 1) * 8 + s;
      indices.push(a, b, c, a, c, d);
    }
  }
  for (let s = 1; s < 7; s++) {
    indices.push(0, s + 1, s);
    const last = (sections.length - 1) * 8;
    indices.push(last, last + s, last + s + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  return faceted;
}

const palettes = new WeakMap<THREE.Group, Map<string, THREE.MeshStandardMaterial>>();

function characterFactory(parent: THREE.Group) {
  let materials = palettes.get(parent);
  if (!materials) {
    materials = new Map<string, THREE.MeshStandardMaterial>();
    palettes.set(parent, materials);
  }
  const material = (color: string, roughness = 0.92) => {
    const key = `${color}:${roughness}`;
    let result = materials!.get(key);
    if (!result) {
      result = new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
      materials!.set(key, result);
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
  const patch = (
    points: [number, number][],
    color: string,
    position: Point,
    target: THREE.Object3D = parent,
    depth = 0.055,
  ) => mesh(outline(points, depth), color, position, target);
  const block = (size: Point, color: string, position: Point, target: THREE.Object3D = parent) =>
    mesh(new THREE.BoxGeometry(...size), color, position, target);
  return { mesh, patch, block, material };
}

// Static skin and fabric share one draw call per material, while textured card backs stay separate.
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
    // Mirrored lapels and thumbs need matching winding after their transform is baked.
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

function buildFace(person: THREE.Group, style: CharacterStyle, kind: number) {
  const { mesh, patch, block } = characterFactory(person);
  const head = new THREE.Group();
  head.position.set(kind === 1 ? -0.12 : 0.05, style.headY, 0.06);
  // Raise the face towards the seated camera, rather than hiding it under the brow or cap.
  head.rotation.set(-0.12, kind === 1 ? -0.12 : kind === 2 ? 0.06 : 0, kind === 1 ? 0.065 : -0.025);
  person.add(head);
  const w = style.headWidth,
    h = style.headHeight;
  mesh(
    loft([
      { y: 0, width: w * 0.45, front: 0.5, back: 0.4, z: 0.1 },
      { y: h * 0.14, width: w * 0.73, front: 0.69, back: 0.52 },
      { y: h * 0.32, width: w * 0.95, front: 0.73, back: 0.64 },
      { y: h * 0.54, width: w, front: 0.77, back: 0.7 },
      { y: h * 0.76, width: w * 0.93, front: 0.71, back: 0.73 },
      { y: h * 0.94, width: w * 0.72, front: 0.49, back: 0.56, z: -0.03 },
      { y: h, width: w * 0.36, front: 0.29, back: 0.35, z: -0.08 },
    ]),
    style.skin,
    [0, 0, 0],
    head,
  );
  for (const side of [-1, 1]) {
    const ear = mesh(
      loft(
        [
          { y: -0.32, width: 0.12, front: 0.1, back: 0.12 },
          { y: -0.1, width: 0.22, front: 0.15, back: 0.15 },
          { y: 0.22, width: 0.19, front: 0.15, back: 0.12 },
          { y: 0.35, width: 0.1, front: 0.08, back: 0.08 },
        ],
        8,
      ),
      style.skin,
      [side * w * 1.02, h * 0.48, -0.01],
      head,
    );
    ear.rotation.z = side * -0.17;
    patch(
      [
        [-0.07, -0.12],
        [0.06, -0.1],
        [0.1, 0.12],
        [-0.04, 0.18],
      ],
      style.skinShadow,
      [side * w * 1.02, h * 0.48, 0.14],
      head,
    );
    // The lid, recess and narrow iris are planes; there are no protruding eyeballs.
    const eye = new THREE.Group();
    eye.position.set(side * w * 0.43, h * 0.59, 0.761);
    eye.rotation.y = side * 0.11;
    head.add(eye);
    patch(
      [
        [-0.25, -0.08],
        [-0.2, 0.07],
        [0.13, 0.09],
        [0.25, -0.025],
        [0.16, -0.11],
        [-0.12, -0.12],
      ],
      style.skinShadow,
      [0, 0, 0],
      eye,
    );
    patch(
      [
        [-0.205, -0.034],
        [-0.13, 0.017],
        [0.13, 0.015],
        [0.19, -0.04],
        [0.1, -0.07],
        [-0.13, -0.074],
      ],
      '#d0c3a5',
      [0, 0, 0.035],
      eye,
    );
    patch(
      [
        [-0.045, -0.065],
        [-0.048, 0.014],
        [0.043, 0.014],
        [0.05, -0.063],
      ],
      '#30312b',
      [side * -0.025, 0, 0.052],
      eye,
    );
    patch(
      [
        [-0.255, 0.085],
        [-0.18, 0.2],
        [0.14, 0.205],
        [0.28, 0.112],
        [0.17, 0.076],
        [-0.11, 0.103],
      ],
      style.skin,
      [0, 0, 0.09],
      eye,
    );
    const brow = patch(
      [
        [-0.25, -0.035],
        [-0.17, 0.065],
        [0.12, 0.075],
        [0.25, -0.005],
        [0.2, -0.065],
        [-0.12, -0.036],
      ],
      style.hair,
      [0, 0.235, 0.105],
      eye,
      0.075,
    );
    brow.rotation.z = side * (kind === 1 ? 0.13 : -0.095);
    // A cheek plane supports the eye and changes the profile below it.
    const cheek = patch(
      [
        [-0.24, 0.13],
        [0.17, 0.14],
        [0.3, -0.08],
        [0.06, -0.25],
        [-0.23, -0.14],
      ],
      style.skin,
      [side * w * 0.67, h * 0.43, 0.61],
      head,
      0.09,
    );
    cheek.rotation.y = side * 0.43;
  }
  // One angular nose with a bridge, projecting tip, nostril wings and a shaded underside.
  const nose = new THREE.BufferGeometry();
  nose.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -0.115,
        h * 0.72,
        0.76,
        0.115,
        h * 0.72,
        0.76,
        -0.18,
        h * 0.43,
        0.81,
        0.18,
        h * 0.43,
        0.81,
        -0.14,
        h * 0.46,
        1.2,
        0.14,
        h * 0.46,
        1.2,
        0,
        h * 0.35,
        0.97,
      ],
      3,
    ),
  );
  nose.setIndex([0, 1, 5, 0, 5, 4, 0, 4, 2, 1, 3, 5, 2, 4, 6, 4, 5, 6, 5, 3, 6, 2, 6, 3]);
  const facetedNose = nose.toNonIndexed();
  nose.dispose();
  facetedNose.computeVertexNormals();
  mesh(facetedNose, style.skin, [0, 0, 0], head);
  for (const side of [-1, 1])
    patch(
      [
        [-0.07, -0.025],
        [0.07, -0.025],
        [0.08, 0.035],
        [-0.06, 0.045],
      ],
      style.skinShadow,
      [side * 0.16, h * 0.39, 0.88],
      head,
    );
  patch(
    [
      [-0.3, 0.023],
      [-0.12, 0.036],
      [0.02, 0.003],
      [0.2, 0.025],
      [0.3, 0],
      [0.22, -0.046],
      [-0.21, -0.044],
    ],
    '#785344',
    [0, h * 0.235, 0.744],
    head,
    0.028,
  );
  patch(
    [
      [-0.28, 0.03],
      [0.25, 0.03],
      [0.18, -0.12],
      [-0.16, -0.15],
    ],
    style.skin,
    [0, h * 0.145, 0.7],
    head,
    0.06,
  );

  if (kind === 0) {
    // Short grey beard follows the jaw; a wide split moustache leaves the mouth readable.
    mesh(
      loft([
        { y: -0.035, width: w * 0.37, front: 0.53, back: 0.1, z: 0.13 },
        { y: h * 0.12, width: w * 0.68, front: 0.66, back: 0.13, z: 0.11 },
        { y: h * 0.25, width: w * 0.96, front: 0.75, back: 0.13, z: 0.03 },
        { y: h * 0.32, width: w * 0.97, front: 0.73, back: 0.12, z: 0.03 },
      ]),
      style.hair,
      [0, 0, 0],
      head,
    );
    for (const side of [-1, 1]) {
      const moustache = patch(
        [
          [-0.04, 0.02],
          [0.17, 0.13],
          [0.4, 0.1],
          [0.54, -0.05],
          [0.3, -0.08],
          [0.1, -0.045],
        ],
        style.hair,
        [0, h * 0.295, 0.9],
        head,
        0.075,
      );
      moustache.scale.x = side;
    }
    mesh(
      loft([
        { y: h * 0.88, width: w * 1.0, front: 0.66, back: 0.74, z: -0.04 },
        { y: h * 1.02, width: w * 1.05, front: 0.61, back: 0.76, z: -0.06 },
        { y: h * 1.13, width: w * 0.91, front: 0.5, back: 0.62, z: -0.06 },
      ]),
      style.cloth,
      [0, 0, 0],
      head,
    );
    block([w * 1.91, 0.12, 0.11], '#27363a', [0, h * 0.885, 0.64], head);
    // A shallow wedge, not a broad shelf over the entire face.
    const visor = patch(
      [
        [-w * 0.8, 0],
        [w * 0.8, 0],
        [w * 0.7, 0.43],
        [-w * 0.7, 0.43],
      ],
      '#29373a',
      [0, h * 0.877, 0.49],
      head,
      0.08,
    );
    visor.rotation.x = Math.PI / 2 + 0.09;
    block([0.34, 0.19, 0.085], '#b0a17a', [0, h * 0.98, 0.64], head);
  } else if (kind === 1) {
    mesh(
      loft([
        { y: h * 0.57, width: w * 0.93, front: 0.24, back: 0.76, z: -0.19 },
        { y: h * 0.82, width: w * 1.03, front: 0.37, back: 0.83, z: -0.18 },
        { y: h * 0.99, width: w * 0.85, front: 0.48, back: 0.64, z: -0.13 },
        { y: h * 1.05, width: w * 0.42, front: 0.29, back: 0.4, z: -0.13 },
      ]),
      style.hair,
      [0, 0, 0],
      head,
    );
    // These two joined slabs form a side part, rather than a collection of black beads.
    const fringe = patch(
      [
        [-0.91, -0.58],
        [-0.77, 0.44],
        [-0.33, 0.73],
        [0.27, 0.69],
        [0.44, 0.43],
        [-0.1, 0.28],
        [-0.4, -0.25],
        [-0.69, -0.74],
      ],
      style.hair,
      [0, h * 0.75, 0.69],
      head,
      0.15,
    );
    fringe.rotation.y = -0.12;
    patch(
      [
        [0.16, 0.64],
        [0.65, 0.49],
        [0.9, 0.16],
        [0.86, -0.61],
        [0.69, -0.43],
        [0.61, 0.12],
        [0.26, 0.38],
      ],
      style.hair,
      [0, h * 0.75, 0.6],
      head,
      0.16,
    );
    mesh(
      loft(
        [
          { y: -0.36, width: 0.24, front: 0.27, back: 0.31 },
          { y: -0.08, width: 0.48, front: 0.37, back: 0.43 },
          { y: 0.29, width: 0.41, front: 0.35, back: 0.34 },
          { y: 0.49, width: 0.2, front: 0.19, back: 0.2 },
        ],
        10,
      ),
      style.hair,
      [0.05, h * 0.82, -0.9],
      head,
    );
    // An open contour runs over the crown to a single headset cup.
    mesh(
      bentVolume(
        [
          [-1.0, h * 0.48, -0.1],
          [-1.05, h * 0.9, -0.14],
          [-0.65, h * 1.07, -0.14],
          [0.34, h * 1.08, -0.14],
          [0.92, h * 0.93, -0.14],
        ],
        [0.075, 0.075, 0.075, 0.075, 0.075],
        [0.09, 0.09, 0.09, 0.09, 0.09],
      ),
      '#494d46',
      [0, 0, 0],
      head,
    );
    mesh(
      loft(
        [
          { y: -0.31, width: 0.18, front: 0.28, back: 0.27 },
          { y: 0, width: 0.24, front: 0.3, back: 0.28 },
          { y: 0.29, width: 0.18, front: 0.24, back: 0.23 },
        ],
        8,
      ),
      '#444a43',
      [-1.02, h * 0.48, -0.05],
      head,
    );
    mesh(
      bentVolume(
        [
          [-1.01, h * 0.4, 0.2],
          [-0.78, h * 0.29, 0.73],
          [-0.31, h * 0.28, 0.99],
        ],
        [0.044, 0.043, 0.04],
        [0.044, 0.043, 0.04],
      ),
      '#495147',
      [0, 0, 0],
      head,
    );
    block([0.14, 0.09, 0.11], '#596151', [-0.28, h * 0.28, 1], head);
  } else {
    mesh(
      loft([
        { y: -0.3, width: w * 0.38, front: 0.56, back: 0.13, z: 0.15 },
        { y: h * 0.04, width: w * 0.64, front: 0.79, back: 0.19, z: 0.06 },
        { y: h * 0.24, width: w * 0.93, front: 0.8, back: 0.25 },
        { y: h * 0.39, width: w * 0.98, front: 0.7, back: 0.2 },
      ]),
      style.hair,
      [0, 0, 0],
      head,
    );
    // The beard returns into sideburns; two large facets give it a jaw rather than a cone.
    for (const side of [-1, 1]) {
      const cheekHair = patch(
        [
          [-0.19, -0.55],
          [0.2, -0.45],
          [0.27, 0.56],
          [0.15, 0.72],
          [-0.13, 0.62],
          [-0.2, 0.12],
        ],
        style.hair,
        [side * w * 0.89, h * 0.4, 0.38],
        head,
        0.13,
      );
      cheekHair.rotation.y = side * 0.65;
      const moustache = patch(
        [
          [-0.02, 0.02],
          [0.19, 0.15],
          [0.46, 0.1],
          [0.55, -0.08],
          [0.13, -0.09],
        ],
        style.hair,
        [0, h * 0.3, 0.96],
        head,
        0.08,
      );
      moustache.scale.x = side;
    }
    mesh(
      loft([
        { y: h * 0.87, width: w * 1.01, front: 0.64, back: 0.76, z: -0.05 },
        { y: h * 0.95, width: w * 1.06, front: 0.68, back: 0.78, z: -0.05 },
        { y: h * 1.14, width: w * 0.95, front: 0.61, back: 0.65, z: -0.06 },
        { y: h * 1.25, width: w * 0.65, front: 0.36, back: 0.43, z: -0.06 },
        { y: h * 1.28, width: w * 0.28, front: 0.2, back: 0.23, z: -0.06 },
      ]),
      '#555d47',
      [0, 0, 0],
      head,
    );
    mesh(
      loft(
        [
          { y: h * 0.84, width: w * 1.03, front: 0.65, back: 0.76, z: -0.04 },
          { y: h * 0.95, width: w * 1.09, front: 0.7, back: 0.8, z: -0.04 },
        ],
        12,
      ),
      '#717559',
      [0, 0, 0],
      head,
    );
    for (const side of [-1, 1]) {
      const seam = block([0.037, 0.29, 0.035], '#85876b', [side * 0.48, h * 1.055, 0.57], head);
      seam.rotation.z = side * 0.2;
    }
  }
  return head;
}

function buildPalm(
  parent: THREE.Group,
  position: Point,
  style: CharacterStyle,
  side: number,
  lifted = false,
) {
  const { patch, block } = characterFactory(parent);
  // One connected palm/finger outline and a thumb; grooves do not detach the fingers.
  const palm = patch(
    [
      [-0.31, -0.25],
      [0.26, -0.23],
      [0.32, 0.13],
      [0.25, 0.4],
      [0.17, 0.52],
      [0.09, 0.55],
      [0.02, 0.5],
      [-0.04, 0.55],
      [-0.13, 0.51],
      [-0.18, 0.46],
      [-0.25, 0.45],
      [-0.31, 0.33],
      [-0.35, 0.1],
    ],
    style.skin,
    position,
    parent,
    0.19,
  );
  palm.scale.x = side;
  palm.rotation.set(lifted ? -0.27 : -Math.PI / 2, lifted ? side * 0.1 : 0, side * -0.14);
  const thumb = patch(
    [
      [-0.05, -0.22],
      [0.14, -0.17],
      [0.25, 0.07],
      [0.16, 0.25],
      [-0.015, 0.19],
      [-0.1, 0.02],
    ],
    style.skin,
    [side * 0.32, -0.02, 0.055],
    palm,
    0.14,
  );
  thumb.rotation.z = side * -0.24;
  for (const x of [-0.17, -0.01, 0.15])
    block([0.014, 0.19, 0.008], style.skinShadow, [x, 0.3, 0.197], palm);
  return palm;
}

/** Original dispatchers: no external mesh or texture, and no private player data. */
export function buildDispatcher(
  parent: THREE.Group,
  player: PublicPlayer,
  x: number,
  z: number,
  index: number,
  cardBack: THREE.Texture | null,
) {
  const kind = index % styles.length,
    style = styles[kind];
  const person = new THREE.Group();
  person.name = ['Старший диспетчер', 'Связистка', 'Путеец'][kind];
  person.position.set(x, -1.28, z);
  person.rotation.y = Math.atan2(-x, -z);
  parent.add(person);
  const { mesh, patch, block, material } = characterFactory(person);
  // The chair is behind the jacket, with broad rails rather than a solid block through the torso.
  block([4.5, 0.28, 2.2], '#29332f', [0, -0.28, -0.35]);
  for (const side of [-1, 1]) block([0.21, 4.5, 0.22], '#303b35', [side * 1.8, 1.65, -1.13]);
  block([3.8, 0.44, 0.27], '#364139', [0, 3.23, -1.13]);
  block([3.8, 0.32, 0.27], '#303b35', [0, 1.65, -1.13]);
  const w = style.width;
  mesh(
    loft([
      { y: -0.55, width: w * 0.57, front: 0.55, back: 0.6, z: -0.17 },
      { y: 0.17, width: w * 0.67, front: 0.67, back: 0.65, z: -0.17 },
      { y: 1.55, width: w * 0.76, front: 0.8, back: 0.65, z: -0.15 },
      { y: 2.97, width: w, front: 0.69, back: 0.62, z: -0.15 },
      { y: 3.58, width: w * 0.83, front: 0.53, back: 0.45, z: -0.07 },
      { y: 3.82, width: 0.6, front: 0.36, back: 0.36, z: 0.03 },
    ]),
    style.cloth,
  );
  mesh(
    loft(
      [
        { y: 3.67, width: 0.43, front: 0.39, back: 0.37 },
        { y: 4.46, width: 0.44, front: 0.37, back: 0.36 },
      ],
      10,
    ),
    style.skin,
    [0, 0, 0.08],
  );
  patch(
    [
      [-0.54, 3.63],
      [0.57, 3.63],
      [0.66, 2.68],
      [0.47, 1.13],
      [-0.3, 1.1],
      [-0.6, 2.52],
    ],
    style.shirt,
    [0, 0, 0.65],
    person,
    0.08,
  );
  // Wide asymmetric lapels and collar stand away from the chest and cast real shadows.
  for (const side of [-1, 1]) {
    const lapel = patch(
      [
        [-0.1, 3.61],
        [0.59, 3.4],
        [0.94, 2.49],
        [0.53, 2.36],
        [0.07, 1.71],
        [-0.26, 2.56],
      ],
      style.clothShadow,
      [side * 0.45, 0, 0.76],
      person,
      0.12,
    );
    lapel.scale.x = side;
    lapel.rotation.y = side * 0.08;
    const collar = patch(
      [
        [-0.12, 3.72],
        [0.52, 3.84],
        [0.81, 3.42],
        [0.28, 3.08],
        [-0.06, 3.42],
      ],
      style.shirt,
      [side * 0.38, 0, 0.86],
      person,
      0.11,
    );
    collar.scale.x = side;
  }
  // Three broad fold planes, subordinate to the continuous fabric surface.
  patch(
    [
      [-0.35, 2.75],
      [-0.53, 1.91],
      [-0.28, 0.38],
      [-0.08, 1.8],
    ],
    style.clothShadow,
    [-w * 0.47, 0, 0.66],
    person,
    0.025,
  ).rotation.y = -0.19;
  patch(
    [
      [-0.12, 2.41],
      [0.12, 2.16],
      [0.26, 0.44],
      [0.1, 0.13],
      [-0.08, 1.9],
    ],
    style.clothShadow,
    [w * 0.55, 0, 0.69],
    person,
    0.025,
  ).rotation.y = 0.18;
  patch(
    [
      [-0.65, 0.38],
      [0.23, 0.29],
      [0.61, 0.39],
      [0.48, 0.53],
      [-0.43, 0.54],
    ],
    style.clothShadow,
    [0, 0, 0.61],
    person,
    0.03,
  );
  for (const y of [2.48, 1.72, 0.96]) {
    const button = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.045, 8), '#aa9e79', [
      0.14,
      y,
      0.94,
    ]);
    button.rotation.x = Math.PI / 2;
  }
  const badge = block([0.57, 0.39, 0.07], '#bcae88', [w * 0.51, 2.85, 0.56]);
  badge.rotation.y = 0.2;
  block([0.45, 0.23, 0.081], player.color, [w * 0.51, 2.85, 0.6]).rotation.y = 0.2;

  for (const side of [-1, 1]) {
    const radioHand = kind === 1 && side === -1;
    const shoulder: Point = [side * (w * 0.86), 3.06, -0.1];
    const elbow: Point = radioHand
      ? [side * (w + 0.27), 1.82, 0.81]
      : [side * (w + 0.2), 0.59, 1.22];
    const wrist: Point = radioHand
      ? [-1.44, 4.65, 0.2]
      : [side * (kind === 2 ? 0.95 : 1.15), 0.21, 2.56];
    mesh(
      bentVolume(
        [shoulder, [side * (w + 0.08), 2.77, 0.19], elbow, wrist],
        [0.66, 0.62, 0.48, 0.29],
        [0.62, 0.55, 0.44, 0.27],
      ),
      style.cloth,
    );
    mesh(
      bentVolume(
        [
          new THREE.Vector3(...elbow).lerp(new THREE.Vector3(...wrist), 0.85).toArray() as Point,
          wrist,
        ],
        [0.34, 0.32],
        [0.31, 0.28],
      ),
      kind === 1 ? style.shirt : style.clothShadow,
    );
    if (radioHand) buildPalm(person, [-1.38, 4.6, 0.11], style, side, true);
    else {
      const palmPosition: Point = [wrist[0], 0.2, 2.74];
      buildPalm(person, palmPosition, style, side);
    }
    // A folded seam crosses the elbow where the sleeve changes direction.
    const seam = patch(
      [
        [-0.31, -0.06],
        [0.28, -0.06],
        [0.32, 0.04],
        [-0.25, 0.08],
      ],
      style.clothShadow,
      [elbow[0], elbow[1] + 0.1, elbow[2] + 0.37],
      person,
      0.025,
    );
    seam.rotation.z = side * -0.16;
  }
  buildFace(person, style, kind);

  if (player.handCount > 0 && cardBack) {
    // A shared printed back is visible, never the opponent's material colours.
    const backMaterial = new THREE.MeshStandardMaterial({ map: cardBack, roughness: 1 });
    const sides = material('#b3aa8f');
    const count = Math.min(5, player.handCount),
      cardGeometry = new THREE.BoxGeometry(0.89, 1.36, 0.045);
    const centerX = kind === 1 ? 0.46 : 0;
    for (let i = 0; i < count; i++) {
      const card = new THREE.Mesh(cardGeometry, [
        sides,
        sides,
        sides,
        sides,
        backMaterial,
        backMaterial,
      ]);
      card.position.set(centerX + (i - (count - 1) / 2) * 0.33, 0.5, 2.67);
      card.rotation.set(-0.39, 0, (i - (count - 1) / 2) * -0.14);
      card.castShadow = true;
      person.add(card);
    }
  }
  consolidateCharacter(person);
  return person;
}
