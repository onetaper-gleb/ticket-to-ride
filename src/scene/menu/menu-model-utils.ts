import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type MenuPoint = readonly [number, number, number];
export type MenuMaterial = keyof typeof MENU_PALETTE;

export const MENU_PALETTE = {
  cream: '#bfae92',
  plasterShade: '#978771',
  green: '#2e403b',
  boardPaint: '#2e403b',
  leather: '#713e29',
  red: '#942e27',
  glassWarm: '#d4a45b',
  burgundy: '#7b3536',
  iron: '#252d2d',
  wood: '#865d3c',
  woodDark: '#3d281b',
  brass: '#ae844d',
  paper: '#f4e8cf',
  glass: '#adc5b5',
  warm: '#ffda90',
  stone: '#a99b87',
  foliage: '#557242',
  foliageLight: '#718c48',
  foliageDark: '#36542e',
  sky: '#9ec2e5',
} as const;

/** XY face, centered origin, thickness along Z. */
export function menuBox(width: number, height: number, depth: number, radius = 0.025) {
  const bevel = Math.min(radius, width / 3, height / 3, depth / 3);
  if (bevel <= 0.008) return new THREE.BoxGeometry(width, height, depth);
  return new RoundedBoxGeometry(width, height, depth, 1, bevel);
}

export type MenuSurfaceOptions = {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
};

/** Optional seamless base-color tiles, keyed by the actual surface material. Caller owns inputs. */
export type MenuSurfaceMaps = Partial<Record<MenuMaterial, THREE.Texture>>;
export type MenuSurfaceOverrides = Partial<Record<MenuMaterial, MenuSurfaceOptions>>;

/** Resources belong to one environment bundle, including all prop builders. */
export function createMenuModelKit(
  wood?: THREE.Texture,
  surfaceMaps: MenuSurfaceMaps = {},
  overrides: MenuSurfaceOverrides = {},
) {
  for (const [kind, override] of Object.entries(overrides)) {
    if (!override) continue;
    for (const key of ['roughness', 'metalness', 'emissiveIntensity'] as const) {
      const value = override[key];
      if (
        value !== undefined &&
        (!Number.isFinite(value) || value < 0 || (key !== 'emissiveIntensity' && value > 1))
      )
        throw new RangeError(`Invalid menu material ${kind}/${key}`);
    }
  }
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Map<MenuMaterial, THREE.MeshStandardMaterial>();
  const textures = new Set<THREE.Texture>();
  const mappedMaterials = new Map<string, THREE.MeshStandardMaterial>();
  let disposed = false;

  function assertAlive() {
    if (disposed) throw new Error('Menu environment is disposed');
  }

  function material(kind: MenuMaterial) {
    assertAlive();
    let result = materials.get(kind);
    if (!result) {
      const override = Object.fromEntries(
        Object.entries(overrides[kind] ?? {}).filter(([, value]) => value !== undefined),
      ) as MenuSurfaceOptions;
      result = new THREE.MeshStandardMaterial({
        color: MENU_PALETTE[kind],
        roughness:
          kind === 'cream' || kind === 'stone'
            ? 0.94
            : kind === 'green'
              ? 0.64
              : kind === 'leather'
                ? 0.72
                : kind === 'brass'
                  ? 0.36
                  : kind === 'iron'
                    ? 0.56
                    : kind === 'glass' || kind === 'glassWarm'
                      ? 0.38
                      : 0.76,
        metalness: kind === 'brass' ? 0.72 : kind === 'iron' ? 0.4 : kind === 'green' ? 0.06 : 0,
        ...(kind === 'warm' ? { emissive: '#ffc35f', emissiveIntensity: 0.55 } : {}),
        ...(kind === 'glassWarm' ? { emissive: '#ffbd64', emissiveIntensity: 0.32 } : {}),
        ...(kind === 'sky'
          ? { color: '#000000', emissive: MENU_PALETTE.sky, emissiveIntensity: 1 }
          : {}),
        ...override,
      });
      result.name = `menu-surface/${kind}`;
      result.userData.menuSurface = kind;
      materials.set(kind, result);
      const source = surfaceMaps[kind] ?? (kind === 'wood' ? wood : undefined);
      if (source) {
        const map = source.clone();
        map.colorSpace = THREE.SRGBColorSpace;
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        textures.add(map);
        result.map = map;
        // New tiles carry base color; A08 legacy wood also gets a muted varnish tint.
        if (override.color === undefined)
          result.color.set(kind === 'wood' && !surfaceMaps.wood ? '#ae9479' : '#ffffff');
      }
    }
    return result;
  }

  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    kind: MenuMaterial,
    name: string,
  ) {
    assertAlive();
    geometries.add(geometry);
    const result = meshWithSurface(parent, geometry, material(kind), name);
    result.castShadow = kind !== 'warm' && kind !== 'sky';
    return result;
  }

  function meshWithSurface(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    surface: THREE.Material,
    name: string,
  ) {
    assertAlive();
    geometries.add(geometry);
    const result = new THREE.Mesh(geometry, surface);
    result.name = name;
    result.castShadow = !surface.transparent;
    result.receiveShadow = !surface.transparent;
    parent.add(result);
    return result;
  }

  /** The bundle owns map clones; the caller retains its input texture. */
  function mappedMesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    kind: MenuMaterial,
    source: THREE.Texture,
    name: string,
    transparent = true,
  ) {
    assertAlive();
    geometries.add(geometry);
    const key = `${kind}:${source.uuid}:${transparent}`;
    let surface = mappedMaterials.get(key);
    if (!surface) {
      const map = source.clone();
      map.colorSpace = THREE.SRGBColorSpace;
      textures.add(map);
      surface = material(kind).clone();
      surface.name = `menu-print/${kind}`;
      delete surface.userData.menuSurface;
      surface.userData.menuPrint = true;
      surface.color.set('#ffffff');
      surface.map = map;
      surface.transparent = transparent;
      surface.alphaTest = transparent ? 0.05 : 0;
      mappedMaterials.set(key, surface);
    }
    return meshWithSurface(parent, geometry, surface, name);
  }

  function batch(parent: THREE.Object3D, name: string) {
    const pieces = new Map<MenuMaterial, THREE.BufferGeometry[]>();
    function add(
      geometry: THREE.BufferGeometry,
      kind: MenuMaterial,
      position: MenuPoint = [0, 0, 0],
      rotation: MenuPoint = [0, 0, 0],
    ) {
      assertAlive();
      const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      geometries.add(part);
      geometry.dispose();
      part.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(...position),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
          new THREE.Vector3(1, 1, 1),
        ),
      );
      const list = pieces.get(kind) ?? [];
      list.push(part);
      pieces.set(kind, list);
    }
    function flush() {
      assertAlive();
      for (const [kind, parts] of pieces) {
        const merged = mergeGeometries(parts, false);
        for (const part of parts) {
          geometries.delete(part);
          part.dispose();
        }
        pieces.delete(kind);
        if (!merged) throw new Error(`Cannot merge menu geometry: ${name}/${kind}`);
        geometries.add(merged);
        mesh(parent, merged, kind, `${name}/${kind}`);
      }
      pieces.clear();
    }
    return { add, flush };
  }

  function texture(texture: THREE.Texture) {
    textures.add(texture);
    return texture;
  }

  function clearMeshes(parent: THREE.Object3D) {
    assertAlive();
    const meshes: THREE.Mesh[] = [];
    parent.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    for (const object of meshes) {
      object.removeFromParent();
      geometries.delete(object.geometry);
      object.geometry.dispose();
    }
  }

  /** Retained roots keep their local meshes and animation/layout transforms. */
  function consolidate(root: THREE.Group, retainedRoots: readonly THREE.Object3D[]) {
    assertAlive();
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const buckets = new Map<
      THREE.Material,
      { geometry: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }
    >();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        if (retainedRoots.includes(node)) return;
      }
      const surface = object.material;
      if (
        Array.isArray(surface) ||
        ![...materials.values(), ...mappedMaterials.values()].includes(
          surface as THREE.MeshStandardMaterial,
        )
      )
        throw new Error(`Unregistered menu material: ${object.name}`);
      const geometry = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone();
      geometries.add(geometry);
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
      const bucket = buckets.get(surface) ?? { geometry: [], meshes: [] };
      bucket.geometry.push(geometry);
      bucket.meshes.push(object);
      buckets.set(surface, bucket);
    });
    for (const [surface, bucket] of buckets) {
      const geometry = mergeGeometries(bucket.geometry, false);
      for (const temporary of bucket.geometry) {
        geometries.delete(temporary);
        temporary.dispose();
      }
      if (!geometry) throw new Error('Cannot consolidate menu geometry');
      geometries.add(geometry);
      for (const object of bucket.meshes) {
        object.removeFromParent();
        geometries.delete(object.geometry);
        object.geometry.dispose();
      }
      const merged = meshWithSurface(root, geometry, surface, `station-static/${surface.uuid}`);
      merged.castShadow = bucket.meshes.some((object) => object.castShadow);
      merged.receiveShadow = bucket.meshes.some((object) => object.receiveShadow);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const geometry of geometries) geometry.dispose();
    for (const surface of materials.values()) surface.dispose();
    for (const surface of mappedMaterials.values()) surface.dispose();
    for (const texture of textures) texture.dispose();
    geometries.clear();
    materials.clear();
    mappedMaterials.clear();
    textures.clear();
  }

  return {
    material,
    mesh,
    mappedMesh,
    batch,
    texture,
    consolidate,
    clearMeshes,
    assertAlive,
    dispose,
    surfaces: materials as ReadonlyMap<MenuMaterial, THREE.MeshStandardMaterial>,
  };
}

export type MenuModelKit = ReturnType<typeof createMenuModelKit>;

export function menuAnchor(parent: THREE.Object3D, name: string, position: MenuPoint) {
  const result = new THREE.Object3D();
  result.name = name;
  result.position.set(...position);
  parent.add(result);
  return result;
}
