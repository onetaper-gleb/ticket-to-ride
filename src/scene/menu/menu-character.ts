import * as THREE from 'three';
import { buildCashierUpperBody, buildSleeve } from './menu-character-geometry';
import { buildCartoonHand, getHandRig, setHandPose } from './menu-character-hands';
import { createCashierMaterials, MENU_CASHIER_PALETTE } from './menu-character-materials';

export type MenuCashierOptions = {
  /** Contact positions in cashierAnchor coordinates, with +Y up and +Z towards the viewer. */
  handRestLeft?: THREE.Vector3;
  handRestRight?: THREE.Vector3;
};

export type MenuCashier = {
  root: THREE.Group;
  ticketGrip: THREE.Object3D;
  handRestLeft: THREE.Object3D;
  handRestRight: THREE.Object3D;
  forearmPivot: THREE.Object3D;
  /** Reparent to ticket-slot and set local position (0, .005, 0); preview placement is cashier-local. */
  ticketsForHolder: THREE.Group;
  ticket: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  hands: { left: THREE.Group; right: THREE.Group };
  dispose(): void;
};

const HAND_SCALE = 0.16;
const RESTING_HAND_SCALE = 0.218;
const TICKET_WIDTH = 1.1;
const TICKET_HEIGHT = 2.1;
const TICKET_THICKNESS = 0.006;

/** Flex toward the palm in the frozen rig's local X axis without changing its bind surface. */
function setPalmFlex(
  hand: THREE.Group,
  curl: Record<'index' | 'middle' | 'ring' | 'little', number>,
) {
  const rig = getHandRig(hand)!;
  for (const name of ['index', 'middle', 'ring', 'little'] as const) {
    const chain = rig.fingers[name];
    for (let i = 0; i < 3; i++) {
      chain[i].quaternion
        .copy(rig.rest.get(chain[i])!)
        .multiply(
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler([0.64, 1.12, 0.8][i] * curl[name], 0, 0),
          ),
        );
    }
  }
  hand.updateMatrixWorld(true);
  rig.skeleton.update();
}

/** Widen only this instance's outer resting knuckles; native cached surfaces stay untouched. */
function widenRestingKnuckles(hand: THREE.Group) {
  const geometry = getHandRig(hand)!.mesh.geometry;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const smooth = (a: number, b: number, value: number) => {
    const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const derivative = (a: number, b: number, value: number) => {
    const t = (value - a) / (b - a);
    return t > 0 && t < 1 ? (6 * t * (1 - t)) / (b - a) : 0;
  };
  const normal = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i);
    const sx = smooth(0.05, 0.3, x),
      sy = smooth(-0.25, 0.05, y);
    const dx = 1 + 0.3 * derivative(0.05, 0.3, x) * sy;
    const dy = 0.3 * sx * derivative(-0.25, 0.05, y);
    positions.setX(i, x + 0.3 * sx * sy);
    // Inverse-transpose of the warp Jacobian preserves the smooth native normals.
    normal.fromBufferAttribute(normals, i);
    normal.set(normal.x / dx, normal.y - (dy * normal.x) / dx, normal.z).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  positions.needsUpdate = true;
  normals.needsUpdate = true;
}

/** Compact and round this instance in its static resting pose; retain the counter-contact Y. */
function roundRestingKnuckles(hand: THREE.Group, contact: THREE.Vector3) {
  const lift = 0.012;
  const rig = getHandRig(hand)!;
  const mesh = rig.mesh,
    geometry = mesh.geometry;
  hand.updateMatrixWorld(true);
  rig.skeleton.update();
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const index = geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
  const weight = geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
  const smooth = (a: number, b: number, v: number) => {
    const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const root = hand.parent!;
  const rootFromMesh = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const transforms: THREE.Matrix4[] = [],
    points: THREE.Vector3[] = [];
  const keys: string[] = [],
    changed = new Set<string>();
  for (let i = 0; i < position.count; i++) {
    const matrix = new THREE.Matrix4();
    matrix.elements.fill(0);
    let fingerWeight = 0;
    for (let j = 0; j < 4; j++) {
      const bone = index.getComponent(i, j),
        amount = weight.getComponent(i, j);
      for (let k = 0; k < 16; k++)
        matrix.elements[k] += rig.skeleton.boneMatrices[bone * 16 + k] * amount;
      if (bone >= 6) fingerWeight += amount;
    }
    matrix.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix).premultiply(rootFromMesh);
    if (Math.abs(matrix.determinant()) < 1e-7)
      throw new Error('Resting hand skin transform is singular');
    transforms.push(matrix);
    const bind = new THREE.Vector3().fromBufferAttribute(position, i);
    const key = bind
      .toArray()
      .map((v) => v.toFixed(7))
      .join(':');
    keys.push(key);
    const point = bind.clone().applyMatrix4(matrix);
    const delta =
      lift *
      fingerWeight *
      smooth(0.28, 0.5, bind.y) *
      smooth(contact.y + 0.02, contact.y + 0.04, point.y);
    point.y += delta;
    const compactBeforeLift = fingerWeight * smooth(0.23, 0.52, bind.y);
    const inverse = delta > 0 || compactBeforeLift > 0 ? matrix.clone().invert() : undefined;
    const liftedBindY = delta > 0 ? point.clone().applyMatrix4(inverse!).y : bind.y;
    const compact = fingerWeight * smooth(0.23, 0.52, liftedBindY);
    let roundedX = 0;
    for (const offset of [-0.056, -0.008, 0.063, 0.136]) {
      const x = point.x - contact.x - offset;
      roundedX += x * Math.exp(-((x / 0.023) ** 2)) * 0.65;
    }
    point.x += (roundedX - 0.02 * smooth(contact.x + 0.09, contact.x + 0.13, point.x)) * compact;
    point.z += (contact.z + 0.072 - point.z) * 0.75 * compact;
    point.y -=
      (point.y - contact.y - 0.002) *
      0.2 *
      compact *
      smooth(contact.y + 0.02, contact.y + 0.04, point.y);
    if (delta > 1e-10 || compact > 1e-10) changed.add(key);
    points.push(point);
    if (delta > 0 || compact > 0) {
      bind.copy(point).applyMatrix4(inverse!);
      position.setXYZ(i, bind.x, bind.y, bind.z);
    }
  }
  // Area-weighted welded surface normals in the posed coordinates; transform back through
  // the same skin linear map used by Three's normal shader. No topology or skin weights change.
  const sums = new Map<string, THREE.Vector3>();
  for (let i = 0; i < position.count; i += 3) {
    const n = points[i + 1]
      .clone()
      .sub(points[i])
      .cross(points[i + 2].clone().sub(points[i]));
    for (let j = 0; j < 3; j++) {
      const k = keys[i + j],
        sum = sums.get(k) ?? new THREE.Vector3();
      sum.add(n);
      sums.set(k, sum);
    }
  }
  for (let i = 0; i < position.count; i++)
    if (changed.has(keys[i])) {
      const n = sums
        .get(keys[i])!
        .clone()
        .normalize()
        .applyMatrix3(new THREE.Matrix3().setFromMatrix4(transforms[i]).invert())
        .normalize();
      normal.setXYZ(i, n.x, n.y, n.z);
    }
  position.needsUpdate = true;
  normal.needsUpdate = true;
}

function setTicketPinch(hand: THREE.Group) {
  setHandPose(hand, {
    curl: [0.725, 0.85, 0.1, 0.15, 0.2],
    thumbOpposition: 0.725,
  });
  setPalmFlex(hand, { index: 0.85, middle: 0.1, ring: 0.15, little: 0.2 });
}

function contactAnchor(name: string, position: THREE.Vector3, parent: THREE.Object3D) {
  const anchor = new THREE.Object3D();
  anchor.name = name;
  anchor.position.copy(position);
  parent.add(anchor);
  return anchor;
}

function posedBounds(hand: THREE.Group) {
  hand.updateMatrixWorld(true);
  const mesh = getHandRig(hand)!.mesh;
  mesh.skeleton.update();
  const inverse = hand.parent!.matrixWorld.clone().invert();
  const transform = inverse.multiply(mesh.matrixWorld);
  const bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
    mesh.getVertexPosition(i, vertex).applyMatrix4(transform);
    bounds.expandByPoint(vertex);
  }
  return bounds;
}

/**
 * Builds an identity root at the counter contact plane. Contacts use cashier-local units.
 * Await preloadMenuHandSurfaces before the first call to avoid procedural extraction.
 * The returned bundle owns its geometry, materials and skeletons, including moved holder papers.
 */
export function buildMenuCashier(options: MenuCashierOptions = {}): MenuCashier {
  const root = new THREE.Group();
  root.name = 'Menu ticket office cashier';
  const leftContact = options.handRestLeft?.clone() ?? new THREE.Vector3(0.35, 0, 0.15);
  const rightContact = options.handRestRight?.clone() ?? new THREE.Vector3(-0.35, 0, 0.15);
  for (const point of [leftContact, rightContact]) {
    if (![point.x, point.y, point.z].every(Number.isFinite)) {
      throw new Error('Cashier contacts require finite coordinates');
    }
  }
  const handRestLeft = contactAnchor('handRestLeft', leftContact, root);
  const handRestRight = contactAnchor('handRestRight', rightContact, root);
  const ticketReach = THREE.MathUtils.clamp((rightContact.x + 0.35) / 0.52, 0, 1);
  root.add(buildCashierUpperBody());
  const materials = createCashierMaterials();
  const addSleeve = (
    parent: THREE.Object3D,
    points: THREE.Vector3[],
    widths: number[],
    material: THREE.MeshStandardMaterial,
    name: string,
    contactY: number,
  ) => {
    const foldCenters =
      material === materials.cloth
        ? name === 'right moving forearm sleeve'
          ? [0.18, 0.32]
          : [0.72, 0.86]
        : [];
    const geometry = buildSleeve(points, widths, widths, foldCenters);
    const positions = geometry.getAttribute('position');
    const floor = contactY + 0.002 - (parent === root ? 0 : parent.position.y);
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, Math.max(floor, positions.getY(i)));
    }
    geometry.computeVertexNormals();
    const sleeve = new THREE.Mesh(geometry, material);
    sleeve.name = name;
    sleeve.castShadow = true;
    sleeve.receiveShadow = true;
    parent.add(sleeve);
    return sleeve;
  };
  const createHand = (side: -1 | 1, contact: THREE.Vector3, resting: boolean) => {
    const hand = buildCartoonHand(MENU_CASHIER_PALETTE.skin, side, false);
    if (resting) widenRestingKnuckles(hand);
    hand.name = resting
      ? 'cashier anatomical left resting hand'
      : 'cashier anatomical right ticket hand';
    hand.scale.setScalar(resting ? RESTING_HAND_SCALE : HAND_SCALE);
    hand.position.copy(contact);
    if (resting) {
      hand.rotation.set(Math.PI / 2, 0, -0.08);
      setHandPose(hand, {
        curl: [0.35, 1.15, 1.25, 1.15, 0.8],
        thumbOpposition: 0.35,
      });
      setPalmFlex(hand, { index: 1.15, middle: 1.25, ring: 1.15, little: 0.8 });
    } else {
      hand.rotation.set(-Math.PI / 2, -0.18, -0.18);
      hand.quaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.44 * ticketReach),
      );
      setTicketPinch(hand);
    }
    const handMaterial = getHandRig(hand)!.mesh.material;
    for (const material of Array.isArray(handMaterial) ? handMaterial : [handMaterial]) {
      material.userData.menuCashierRole = 'skin-hand';
      if (resting && material instanceof THREE.MeshStandardMaterial) material.roughness = 1;
    }
    root.add(hand);
    root.updateMatrixWorld(true);
    hand.position.y += contact.y + 0.002 - posedBounds(hand).min.y;
    hand.updateMatrix();
    if (resting) roundRestingKnuckles(hand, contact);
    return hand;
  };
  const left = createHand(1, leftContact, true);
  const right = createHand(-1, rightContact, false);
  const leftWrist = new THREE.Vector3(0, -0.5, 0).applyMatrix4(left.matrix);
  const rightWrist = new THREE.Vector3(0, -0.5, 0).applyMatrix4(right.matrix);
  const leftElbow = leftContact.clone().add(new THREE.Vector3(0.055, 0.06, -0.21));
  const rightElbow = rightContact.clone().add(new THREE.Vector3(-0.055, 0.06, -0.21));
  // Keep the elbow on its anatomical side when a supplied contact reaches across the counter.
  rightElbow.x = Math.min(rightElbow.x, -0.34);
  rightElbow.y += 0.015 * ticketReach;
  const leftCuffStart = leftElbow.clone().lerp(leftWrist, 0.7);
  addSleeve(
    root,
    [
      new THREE.Vector3(0.345, 0.505, -0.27),
      new THREE.Vector3(0.47486, 0.24, -0.17),
      leftElbow,
      leftCuffStart,
    ],
    [0.127, 0.14, 0.088, 0.052],
    materials.cloth,
    'left burgundy sleeve',
    leftContact.y,
  );
  addSleeve(
    root,
    [leftElbow.clone().lerp(leftWrist, 0.68), leftWrist],
    [0.06, 0.049],
    materials.cuff,
    'left cream cuff',
    leftContact.y,
  );
  addSleeve(
    root,
    [new THREE.Vector3(-0.345, 0.505, -0.27), new THREE.Vector3(-0.475, 0.24, -0.17), rightElbow],
    [0.127, 0.14, 0.088],
    materials.cloth,
    'right static upper sleeve',
    rightContact.y,
  );
  const forearmPivot = new THREE.Group();
  forearmPivot.name = 'forearmPivot';
  forearmPivot.position.copy(rightElbow);
  root.add(forearmPivot);
  root.updateMatrixWorld(true);
  forearmPivot.attach(right);
  const localWrist = rightWrist.clone().sub(rightElbow);
  // The unreached pose needs fabric in front of the relaxed fingers.
  const forearmClearance = new THREE.Vector3(0, 0, 0.05 * (1 - ticketReach));
  addSleeve(
    forearmPivot,
    [
      new THREE.Vector3(),
      localWrist.clone().multiplyScalar(0.4).add(forearmClearance),
      localWrist
        .clone()
        .multiplyScalar(THREE.MathUtils.lerp(0.7, 0.87, ticketReach))
        .add(forearmClearance),
    ],
    [0.088, THREE.MathUtils.lerp(0.058, 0.074, ticketReach), 0.05],
    materials.cloth,
    'right moving forearm sleeve',
    rightContact.y,
  );
  addSleeve(
    forearmPivot,
    [localWrist.clone().multiplyScalar(THREE.MathUtils.lerp(0.68, 0.86, ticketReach)), localWrist],
    [0.06, 0.049],
    materials.cuff,
    'right moving cream cuff',
    rightContact.y,
  );

  // The wrist bone owns the paper so wrist rotations cannot leave it behind.
  const ticketGrip = new THREE.Group();
  ticketGrip.name = 'ticketGrip';
  getHandRig(right)!.wrist.add(ticketGrip);
  ticketGrip.position.set(0.2854797512, 0.8281042599, 0.4100078096);
  ticketGrip.quaternion.set(0.6205496137, -0.0243775746, -0.0307664825, 0.7831840999).normalize();
  // Tilt within the paper plane and seat the lower edge as the hand reaches across the counter.
  ticketGrip.quaternion.multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.2),
  );
  ticketGrip.position.add(
    new THREE.Vector3(-0.16, -0.09, 0)
      .multiplyScalar(ticketReach)
      .applyQuaternion(ticketGrip.quaternion),
  );
  const ticketGeometry = new THREE.BoxGeometry(TICKET_WIDTH, TICKET_HEIGHT, TICKET_THICKNESS);
  ticketGeometry.translate(0, TICKET_HEIGHT / 2, 0);
  const ticket = new THREE.Mesh(ticketGeometry, materials.paper);
  ticket.name = 'neutral cashier ticket — replace print after art handoff';
  ticket.castShadow = true;
  ticket.receiveShadow = true;
  ticketGrip.add(ticket);

  const ticketsForHolder = new THREE.Group();
  ticketsForHolder.name = 'ticketsForHolder';
  ticketsForHolder.position.set(-0.61, 0.016, 0.11);
  root.add(ticketsForHolder);
  const holderGeometry = new THREE.BoxGeometry(0.075, 0.16, 0.0025);
  holderGeometry.translate(0, 0.08, 0);
  for (let i = 0; i < 3; i++) {
    const paper = new THREE.Mesh(holderGeometry, materials.paper);
    paper.name = `holder neutral ticket ${i + 1}`;
    paper.position.set((i - 1) * 0.018, 0, -i * 0.007);
    paper.rotation.z = (i - 1) * 0.12;
    paper.castShadow = true;
    ticketsForHolder.add(paper);
  }
  root.updateMatrixWorld(true);
  const geometries = new Set<THREE.BufferGeometry>();
  const ownedMaterials = new Set<THREE.Material>();
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      ownedMaterials.add(material);
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  let disposed = false;
  return {
    root,
    ticketGrip,
    handRestLeft,
    handRestRight,
    forearmPivot,
    ticketsForHolder,
    ticket,
    hands: { left, right },
    dispose() {
      if (disposed) return;
      disposed = true;
      skeletons.forEach((skeleton) => skeleton.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((material) => material.dispose());
      ticketsForHolder.removeFromParent();
      root.removeFromParent();
    },
  };
}
