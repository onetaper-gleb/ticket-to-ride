import * as THREE from 'three';
import { getHandRig } from './cartoon-hands';

export type ArmPose = {
  shoulder: THREE.Vector3;
  elbow: THREE.Vector3;
  wrist: THREE.Vector3;
  upperRotation: THREE.Quaternion;
  lowerRotation: THREE.Quaternion;
  upperLength: number;
  lowerLength: number;
};
export type ArmRig = {
  parent: THREE.Group;
  shoulder: THREE.Bone;
  elbow: THREE.Bone;
  wrist: THREE.Bone;
  skeleton: THREE.Skeleton;
  sleeve: THREE.SkinnedMesh;
  cuff: THREE.SkinnedMesh;
  hand: THREE.Group;
  origin: THREE.Vector3;
  pole: THREE.Vector3;
  upperLength: number;
  lowerLength: number;
};
const rigs = new WeakMap<THREE.Group, ArmRig[]>();

function rotationAlong(direction: THREE.Vector3, normal: THREE.Vector3) {
  const y = direction.clone().normalize();
  const z = normal.clone().normalize();
  const x = y.clone().cross(z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Two fixed-length bones; the pole selects the elbow's bend plane. Coordinates are character-local. */
export function solveArmPose(
  shoulder: THREE.Vector3,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  upperLength: number,
  lowerLength: number,
): ArmPose {
  const direction = target.clone().sub(shoulder);
  if (direction.lengthSq() < 1e-10) direction.set(0, 0, 1);
  const distance = THREE.MathUtils.clamp(
    target.distanceTo(shoulder),
    Math.abs(upperLength - lowerLength) + 1e-4,
    upperLength + lowerLength - 1e-4,
  );
  direction.normalize();
  const bend = pole.clone().sub(shoulder);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-10) {
    bend.set(Math.abs(direction.y) < 0.9 ? 0 : 1, Math.abs(direction.y) < 0.9 ? 1 : 0, 0);
    bend.addScaledVector(direction, -bend.dot(direction));
  }
  bend.normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(bend, height);
  const wrist = shoulder.clone().addScaledVector(direction, distance);
  const upper = elbow.clone().sub(shoulder).normalize();
  const lower = wrist.clone().sub(elbow).normalize();
  const normal = upper.clone().cross(lower).normalize();
  return {
    shoulder: shoulder.clone(),
    elbow,
    wrist,
    upperRotation: rotationAlong(upper, normal),
    lowerRotation: rotationAlong(lower, normal),
    upperLength,
    lowerLength,
  };
}

function applyPose(rig: ArmRig, pose: ArmPose) {
  rig.shoulder.quaternion.copy(pose.upperRotation);
  rig.elbow.quaternion.copy(pose.upperRotation).invert().multiply(pose.lowerRotation);
  rig.parent.updateMatrixWorld(true);
  rig.skeleton.update();
  getHandRig(rig.hand)?.skeleton.update();
}

export function getArmRigs(character: THREE.Group): readonly ArmRig[] {
  return rigs.get(character) ?? [];
}

/** Moves the hand, cards, cuff and sleeve through the same bone chain without replacing geometry. */
export function setArmTarget(rig: ArmRig, target: THREE.Vector3, pole = rig.pole) {
  applyPose(rig, solveArmPose(rig.origin, target, pole, rig.upperLength, rig.lowerLength));
}

export function buildArmRig(
  parent: THREE.Group,
  pose: ArmPose,
  pole: THREE.Vector3,
  hand: THREE.Group,
  sleeveGeometry: THREE.BufferGeometry,
  cuffGeometry: THREE.BufferGeometry,
  sleeveMaterial: THREE.Material,
  cuffMaterial: THREE.Material,
) {
  const shoulder = new THREE.Bone(),
    elbow = new THREE.Bone(),
    wrist = new THREE.Bone();
  const side = pose.shoulder.x < 0 ? 'L' : 'R';
  shoulder.name = `arm_${side}_shoulder`;
  elbow.name = `arm_${side}_elbow`;
  wrist.name = `arm_${side}_wrist`;
  shoulder.position.copy(pose.shoulder);
  elbow.position.set(0, pose.upperLength, 0);
  wrist.position.set(0, pose.lowerLength, 0);
  parent.add(shoulder);
  shoulder.add(elbow);
  elbow.add(wrist);
  shoulder.quaternion.copy(pose.upperRotation);
  elbow.quaternion.copy(pose.upperRotation).invert().multiply(pose.lowerRotation);
  parent.updateMatrixWorld(true);

  const upper = pose.elbow.clone().sub(pose.shoulder).normalize();
  const lower = pose.wrist.clone().sub(pose.elbow).normalize();
  const tangent = upper.add(lower).normalize();
  for (const [geometry, isCuff] of [
    [sleeveGeometry, false],
    [cuffGeometry, true],
  ] as const) {
    const source = geometry.getAttribute('position');
    const indices = new Uint16Array(source.count * 4),
      weights = new Float32Array(source.count * 4);
    for (let i = 0; i < source.count; i++) {
      const offset = i * 4;
      if (isCuff) {
        indices[offset] = 2;
        weights[offset] = 1;
      } else {
        const point = new THREE.Vector3().fromBufferAttribute(source, i).sub(pose.elbow);
        const t = THREE.MathUtils.smoothstep(point.dot(tangent), -0.4, 0.4);
        indices[offset] = 0;
        indices[offset + 1] = 1;
        weights[offset] = 1 - t;
        weights[offset + 1] = t;
      }
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  }
  const skeleton = new THREE.Skeleton([shoulder, elbow, wrist]);
  const sleeve = new THREE.SkinnedMesh(sleeveGeometry, sleeveMaterial);
  const cuff = new THREE.SkinnedMesh(cuffGeometry, cuffMaterial);
  sleeve.name = `Рука ${side} · скелетный рукав`;
  cuff.name = `Рука ${side} · скелетная манжета`;
  parent.add(sleeve, cuff);
  parent.updateMatrixWorld(true);
  sleeve.bind(skeleton);
  cuff.bind(skeleton);
  sleeve.castShadow = cuff.castShadow = true;
  sleeve.receiveShadow = cuff.receiveShadow = true;
  // Bounds include the complete reach envelope for future arm poses.
  const radius = pose.upperLength + pose.lowerLength + 1;
  for (const mesh of [sleeve, cuff]) {
    mesh.boundingSphere = new THREE.Sphere(pose.shoulder.clone(), radius);
    mesh.boundingBox = new THREE.Box3().setFromCenterAndSize(
      pose.shoulder,
      new THREE.Vector3().setScalar(radius * 2),
    );
  }
  wrist.attach(hand);
  const rig: ArmRig = {
    parent,
    shoulder,
    elbow,
    wrist,
    skeleton,
    sleeve,
    cuff,
    hand,
    origin: pose.shoulder.clone(),
    pole: pole.clone(),
    upperLength: pose.upperLength,
    lowerLength: pose.lowerLength,
  };
  const list = rigs.get(parent) ?? [];
  list.push(rig);
  rigs.set(parent, list);
  applyPose(rig, pose);
  return rig;
}
