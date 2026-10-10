import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

type Point = readonly [number, number, number];
type Surface = { positions: Float32Array; normals: Float32Array };

// Only CPU arrays are retained. Each scene owns and disposes its own GPU resources.
const surfaces = new Map<boolean, Surface>();

function capsule(x: number, y: number, z: number, a: Point, b: Point, radius: number) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    dz = b[2] - a[2];
  const t = THREE.MathUtils.clamp(
    ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / (dx * dx + dy * dy + dz * dz),
    0,
    1,
  );
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t, z - a[2] - dz * t) - radius;
}

function blend(a: number, b: number, radius = 0.095) {
  const h = Math.max(radius - Math.abs(a - b), 0) / radius;
  return Math.min(a, b) - h * h * radius * 0.25;
}

function handSurface(grip: boolean): Surface {
  const cached = surfaces.get(grip);
  if (cached) return cached;
  const resolution = 40;
  const extent = 1.12;
  const temporaryMaterial = new THREE.MeshBasicMaterial();
  const surface = new MarchingCubes(resolution, temporaryMaterial, false, false, 12000);
  surface.isolation = 0;
  const fingers = [
    { x: -0.34, tip: 0.73, radius: 0.096 },
    { x: -0.115, tip: 0.85, radius: 0.101 },
    { x: 0.125, tip: 0.81, radius: 0.1 },
    { x: 0.35, tip: 0.64, radius: 0.086 },
  ];
  for (let iz = 0; iz < resolution; iz++) {
    const z = (iz / resolution - 0.5) * 2 * extent;
    for (let iy = 0; iy < resolution; iy++) {
      const y = (iy / resolution - 0.5) * 2 * extent;
      for (let ix = 0; ix < resolution; ix++) {
        const x = (ix / resolution - 0.5) * 2 * extent;
        // A broad padded palm blends into the wrist and all five finger roots.
        let distance = (Math.hypot(x / 0.49, (y + 0.05) / 0.4, z / 0.18) - 1) * 0.18;
        distance = blend(distance, capsule(x, y, z * 1.5, [0, -0.6, 0], [0, -0.26, 0], 0.25));
        for (const finger of fingers) {
          const root: Point = [finger.x, 0.2, 0];
          const middle: Point = [finger.x, grip ? 0.46 : finger.tip - 0.18, grip ? -0.1 : -0.01];
          const tip: Point = [
            finger.x,
            grip ? finger.tip - 0.19 : finger.tip,
            grip ? -0.26 : -0.035,
          ];
          const first = capsule(x, y, z, root, middle, finger.radius);
          const second = capsule(x, y, z, middle, tip, finger.radius * 0.91);
          const webBlend = 0.012 + 0.06 * THREE.MathUtils.clamp((0.48 - y) / 0.26, 0, 1);
          distance = blend(distance, Math.min(first, second), webBlend);
        }
        const thumbRoot: Point = [-0.37, -0.14, 0.02];
        const thumbJoint: Point = [grip ? -0.59 : -0.63, 0.08, grip ? 0.12 : 0.02];
        const thumbTip: Point = [grip ? -0.43 : -0.64, grip ? 0.34 : 0.31, grip ? 0.28 : 0.015];
        distance = blend(distance, capsule(x, y, z, thumbRoot, thumbJoint, 0.15), 0.12);
        distance = blend(distance, capsule(x, y, z, thumbJoint, thumbTip, 0.13), 0.075);
        surface.field[ix + iy * resolution + iz * resolution * resolution] = -distance;
      }
    }
  }
  surface.update();
  const count = surface.geometry.drawRange.count;
  const result = {
    positions: new Float32Array(
      surface.geometry.getAttribute('position').array.slice(0, count * 3),
    ),
    normals: new Float32Array(surface.geometry.getAttribute('normal').array.slice(0, count * 3)),
  };
  for (let i = 0; i < result.positions.length; i++) result.positions[i] *= extent;
  surface.geometry.dispose();
  temporaryMaterial.dispose();
  surfaces.set(grip, result);
  return result;
}

/** A continuous toy hand: +y points to fingers, +z to the palm, and the thumb faces inward. */
export function buildCartoonHand(skin: string, side: -1 | 1, grip = true): THREE.Group {
  const surface = handSurface(grip);
  const positions = surface.positions.slice(),
    normals = surface.normals.slice();
  if (side === -1) {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] *= -1;
      normals[i] *= -1;
    }
    // Reflection reverses winding. Exchange two vertices of every triangle as well.
    for (const attribute of [positions, normals]) {
      for (let i = 0; i < attribute.length; i += 9) {
        for (let component = 0; component < 3; component++) {
          const value = attribute[i + 3 + component]!;
          attribute[i + 3 + component] = attribute[i + 6 + component]!;
          attribute[i + 6 + component] = value;
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.88 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.name = grip ? 'Кисть с захватом карт' : 'Открытая кисть';
  group.add(mesh);
  return group;
}
