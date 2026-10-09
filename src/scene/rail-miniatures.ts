import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type CoachGeometry = {
  enamel: THREE.BufferGeometry;
  iron: THREE.BufferGeometry;
  brass: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
};

const IRON = '#25302f';
const BRASS = '#c5a974';
const GLASS = '#d5ded0';

/** A factory belongs to one board build. All resources are reachable from its meshes. */
export function createRailMiniatures() {
  const coachGeometries = new Map<string, CoachGeometry>();
  const slotGeometries = new Map<string, THREE.BufferGeometry[]>();
  const materials = new Map<string, THREE.MeshStandardMaterial>();

  const material = (color: string, kind: 'enamel' | 'iron' | 'brass' | 'glass' | 'print') => {
    const key = `${kind}:${color}`;
    let result = materials.get(key);
    if (!result) {
      result = new THREE.MeshStandardMaterial({
        color,
        roughness:
          kind === 'enamel' ? 0.34 : kind === 'brass' ? 0.45 : kind === 'glass' ? 0.28 : 0.86,
        metalness: kind === 'brass' ? 0.48 : kind === 'iron' ? 0.28 : 0,
      });
      materials.set(key, result);
    }
    return result;
  };

  function addBatch(
    group: THREE.Group,
    geometry: THREE.BufferGeometry,
    surface: THREE.Material,
    castsShadow = true,
  ) {
    const object = new THREE.Mesh(geometry, surface);
    object.castShadow = castsShadow;
    object.receiveShadow = true;
    group.add(object);
    return object;
  }

  /** Z runs along the train; the wheel bottoms sit on Y=0. Length includes couplers. */
  function addCoach(parent: THREE.Object3D, color: string, length: number, width = 0.3) {
    const safeLength = Math.max(0.12, length);
    const safeWidth = Math.max(0.08, width);
    const key = `${safeLength.toFixed(4)}:${safeWidth.toFixed(4)}`;
    let geometry = coachGeometries.get(key);
    if (!geometry) {
      geometry = buildCoach(safeLength, safeWidth);
      coachGeometries.set(key, geometry);
    }
    const group = new THREE.Group();
    group.name = 'Enamel passenger coach';
    addBatch(group, geometry.enamel, material(color, 'enamel'));
    addBatch(group, geometry.iron, material(IRON, 'iron'));
    addBatch(group, geometry.brass, material(BRASS, 'brass'));
    addBatch(group, geometry.glass, material(GLASS, 'glass'));
    parent.add(group);
    return group;
  }

  /** A shallow printed recess, distinct from an owned miniature. Ferry marks are anchors. */
  function addTrackSlot(
    parent: THREE.Object3D,
    color: string,
    length: number,
    width = 0.3,
    tunnel = false,
    ferry = false,
  ) {
    const safeLength = Math.max(0.12, length);
    const safeWidth = Math.max(0.08, width);
    const key = `${safeLength.toFixed(4)}:${safeWidth.toFixed(4)}:${tunnel}:${ferry}`;
    let geometry = slotGeometries.get(key);
    if (!geometry) {
      geometry = buildSlot(safeLength, safeWidth, tunnel, ferry);
      slotGeometries.set(key, geometry);
    }
    const group = new THREE.Group();
    group.name = ferry ? 'Ferry berth' : tunnel ? 'Tunnel berth' : 'Printed carriage berth';
    addBatch(group, geometry[0], material(color, 'print'), false);
    addBatch(group, geometry[1], material(tunnel ? '#253735' : '#66756b', 'print'), false);
    if (geometry[2]) addBatch(group, geometry[2], material('#eee2bc', 'print'), false);
    parent.add(group);
    return group;
  }

  return { addCoach, addTrackSlot };
}

function transformed(
  geometry: THREE.BufferGeometry,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(1, 1, 1),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

function box(
  width: number,
  height: number,
  length: number,
  position: [number, number, number],
  radius = 0,
) {
  return transformed(
    // Tiny mouldings and glazing are flat cuts. Only the main body needs curved corners.
    radius > 0 && Math.min(width, height, length) > radius * 5
      ? new RoundedBoxGeometry(
          width,
          height,
          length,
          2,
          Math.min(radius, width / 3, height / 3, length / 3),
        )
      : new THREE.BoxGeometry(width, height, length),
    position,
  );
}

function merged(parts: THREE.BufferGeometry[]) {
  // Extruded and primitive pieces do not share index layouts. Normalize only once per template.
  const normalized = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const geometry = mergeGeometries(normalized, false);
  if (!geometry) throw new Error('Miniature geometry has incompatible attributes');
  const temporaries = new Set([...parts, ...normalized]);
  temporaries.forEach((part) => part.dispose());
  return geometry;
}

function buildCoach(length: number, width: number): CoachGeometry {
  const unit = width / 0.3;
  const h = (value: number) => value * unit;
  const bodyLength = length * 0.82;
  const bodyWidth = width * 0.87;
  const enamel: THREE.BufferGeometry[] = [];
  const iron: THREE.BufferGeometry[] = [];
  const brass: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];

  enamel.push(box(bodyWidth, h(0.15), bodyLength, [0, h(0.161), 0], h(0.014)));

  // A barrel roof gives the coach a readable silhouette even when viewed almost from above.
  const roof = new THREE.Shape();
  roof.moveTo(-width * 0.49, h(0.226));
  roof.quadraticCurveTo(-width * 0.45, h(0.276), 0, h(0.283));
  roof.quadraticCurveTo(width * 0.45, h(0.276), width * 0.49, h(0.226));
  roof.lineTo(-width * 0.49, h(0.226));
  const roofGeometry = new THREE.ExtrudeGeometry(roof, {
    depth: bodyLength * 1.04,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: h(0.006),
    bevelThickness: h(0.006),
    curveSegments: 8,
  });
  roofGeometry.translate(0, 0, -bodyLength * 0.52);
  enamel.push(roofGeometry);

  const wheelRadius = h(0.04);
  const bogieZ = bodyLength * 0.31;
  iron.push(box(width * 0.77, h(0.037), bodyLength * 1.01, [0, h(0.078), 0], h(0.005)));
  for (const direction of [-1, 1]) {
    const z = direction * bogieZ;
    iron.push(box(width * 0.74, h(0.035), length * 0.18, [0, h(0.055), z], h(0.006)));
    for (const axle of [-1, 1]) {
      const axleZ = z + axle * Math.min(length * 0.04, h(0.035));
      for (const side of [-1, 1]) {
        iron.push(
          transformed(
            new THREE.CylinderGeometry(wheelRadius, wheelRadius, h(0.027), 12),
            [side * width * 0.405, wheelRadius, axleZ],
            [0, 0, Math.PI / 2],
          ),
        );
      }
    }
  }

  const windowCount = Math.max(2, Math.min(6, Math.round((length / width) * 1.65)));
  const windowSpan = bodyLength * 0.77;
  const windowPitch = windowSpan / windowCount;
  const windowLength = Math.min(windowPitch * 0.72, h(0.07));
  for (const side of [-1, 1]) {
    const x = side * (bodyWidth / 2 + h(0.001));
    // Window frames and the two longitudinal mouldings are one brass batch.
    brass.push(box(h(0.005), h(0.007), bodyLength * 0.91, [x, h(0.133), 0]));
    brass.push(box(h(0.005), h(0.008), bodyLength * 0.96, [side * width * 0.476, h(0.234), 0]));
    iron.push(box(h(0.011), h(0.013), bodyLength * 0.78, [side * width * 0.42, h(0.098), 0]));
    for (let i = 0; i < windowCount; i++) {
      const z = (i - (windowCount - 1) / 2) * windowPitch;
      brass.push(box(h(0.006), h(0.071), windowLength, [x, h(0.185), z], h(0.004)));
      iron.push(
        box(h(0.008), h(0.062), windowLength * 0.84, [x + side * h(0.004), h(0.185), z], h(0.003)),
      );
      glass.push(
        box(h(0.009), h(0.049), windowLength * 0.69, [x + side * h(0.009), h(0.187), z], h(0.003)),
      );
    }
  }

  // End doors, buffers, couplings and boarding steps retain their shape at small scale.
  for (const end of [-1, 1]) {
    const z = end * bodyLength * 0.501;
    iron.push(box(width * 0.31, h(0.105), h(0.008), [0, h(0.159), z], h(0.004)));
    glass.push(box(width * 0.2, h(0.042), h(0.009), [0, h(0.186), z + end * h(0.005)], h(0.003)));
    brass.push(box(width * 0.5, h(0.011), length * 0.041, [0, h(0.103), end * length * 0.443]));
    iron.push(
      box(width * 0.09, h(0.023), length * 0.075, [0, h(0.057), end * length * 0.464], h(0.004)),
    );
    for (const side of [-1, 1])
      brass.push(
        box(
          width * 0.066,
          h(0.026),
          h(0.017),
          [side * width * 0.28, h(0.075), end * length * 0.44],
          h(0.004),
        ),
      );
  }

  // The raised roof spine and its three ventilators make the miniature readable from above.
  brass.push(box(width * 0.025, h(0.006), bodyLength * 0.79, [0, h(0.287), 0], h(0.002)));
  for (const z of [-0.23, 0, 0.23])
    brass.push(
      box(
        width * 0.12,
        h(0.009),
        Math.min(length * 0.04, h(0.026)),
        [0, h(0.291), bodyLength * z],
        h(0.003),
      ),
    );

  return {
    enamel: merged(enamel),
    iron: merged(iron),
    brass: merged(brass),
    glass: merged(glass),
  };
}

function buildSlot(length: number, width: number, tunnel: boolean, ferry: boolean) {
  const unit = width / 0.3;
  const base = box(width * 0.93, 0.014 * unit, length * 0.93, [0, 0.007 * unit, 0], 0.018 * unit);
  const ink: THREE.BufferGeometry[] = [];
  const light: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    ink.push(box(0.01 * unit, 0.003 * unit, length * 0.87, [side * width * 0.36, 0.016 * unit, 0]));
    if (tunnel)
      ink.push(
        box(width * 0.15, 0.003 * unit, length * 0.87, [side * width * 0.39, 0.017 * unit, 0]),
      );
  }
  for (const end of [-1, 1])
    ink.push(box(width * 0.68, 0.003 * unit, 0.009 * unit, [0, 0.016 * unit, end * length * 0.4]));

  if (ferry) {
    // Flat anchor: no raised locomotive which could be mistaken for an occupied route.
    light.push(
      box(width * 0.08, 0.004 * unit, Math.min(length * 0.48, width * 0.5), [0, 0.02 * unit, 0]),
    );
    light.push(box(width * 0.4, 0.004 * unit, width * 0.065, [0, 0.02 * unit, -width * 0.08]));
    const anchor = new THREE.TorusGeometry(width * 0.17, width * 0.033, 4, 12, Math.PI);
    anchor.rotateX(-Math.PI / 2);
    anchor.translate(0, 0.02 * unit, width * 0.13);
    light.push(anchor);
    const ring = new THREE.TorusGeometry(width * 0.08, width * 0.022, 4, 10);
    ring.rotateX(-Math.PI / 2);
    ring.translate(0, 0.02 * unit, -width * 0.23);
    light.push(ring);
  } else if (tunnel) {
    // Three pale ribs provide a redundant visual mark beside the dark tunnel rails.
    for (const z of [-0.2, 0, 0.2])
      light.push(box(width * 0.61, 0.003 * unit, width * 0.045, [0, 0.021 * unit, length * z]));
  }
  return [base, merged(ink), ...(light.length ? [merged(light)] : [])];
}
