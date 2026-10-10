import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getArmRigs, setArmTarget, solveArmPose } from './arm-rig';
import { buildDispatcher } from './characters';
import { getHandRig } from './cartoon-hands';
import { disposeObjects } from './tabletop';

function vertices(mesh: THREE.SkinnedMesh) {
  return Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, i) =>
    mesh.getVertexPosition(i, new THREE.Vector3()),
  );
}
const difference = (a: THREE.Vector3[], b: THREE.Vector3[]) =>
  Math.max(...a.map((p, i) => p.distanceTo(b[i])));

describe('whole-arm rig', () => {
  it('reaches targets with fixed bone lengths and clamps unreachable targets without stretching', () => {
    const shoulder = new THREE.Vector3(-1.5, 2.38, -0.04);
    const pole = new THREE.Vector3(-2.3, 0.25, 0.9);
    for (const target of [
      new THREE.Vector3(-0.75, 0.92, 2.85),
      new THREE.Vector3(-1.2, 0.03, 2.58),
      new THREE.Vector3(-30, 30, 30),
      shoulder.clone(),
      shoulder.clone().add(new THREE.Vector3(0, 5, 0)),
    ]) {
      const pose = solveArmPose(shoulder, target, pole, 2.25, 2.35);
      expect(pose.shoulder.distanceTo(pose.elbow)).toBeCloseTo(2.25, 8);
      expect(pose.elbow.distanceTo(pose.wrist)).toBeCloseTo(2.35, 8);
      expect(pose.wrist.distanceTo(shoulder)).toBeLessThan(4.6);
      expect(pose.elbow.toArray().every(Number.isFinite)).toBe(true);
      const hinge = pose.upperRotation.clone().invert().multiply(pose.lowerRotation);
      expect(Math.abs(hinge.x)).toBeLessThan(1e-7);
      expect(Math.abs(hinge.y)).toBeLessThan(1e-7);
      if (target.distanceTo(shoulder) > 0.1 && target.distanceTo(shoulder) < 4.599)
        expect(pose.wrist.distanceTo(target)).toBeLessThan(1e-7);
    }
  });

  it('moves the real sleeve, cuff, hand and fan together, then restores the same meshes', () => {
    for (let kind = 0; kind < 4; kind++) {
      const scene = new THREE.Group();
      const person = buildDispatcher(
        scene,
        {
          id: kind,
          name: 'Test',
          color: '#527e65',
          handCount: 5,
          ticketCount: 2,
          trainsRemaining: 45,
          stationsRemaining: 3,
          stations: [],
          score: 0,
        },
        3,
        -15,
        kind,
        new THREE.Texture(),
      );
      const rigs = getArmRigs(person);
      expect(rigs).toHaveLength(2);
      scene.updateMatrixWorld(true);
      let disposed = 0;
      for (const arm of rigs) {
        expect(arm.skeleton.bones).toEqual([arm.shoulder, arm.elbow, arm.wrist]);
        expect(arm.hand.parent).toBe(arm.wrist);
        const restTarget = person.worldToLocal(arm.wrist.getWorldPosition(new THREE.Vector3()));
        const restSkin = vertices(arm.sleeve),
          restCuff = vertices(arm.cuff);
        const geometry = arm.sleeve.geometry;
        const beforeHand = arm.hand.getWorldPosition(new THREE.Vector3());
        const forearm = arm.wrist
          .getWorldPosition(new THREE.Vector3())
          .sub(arm.elbow.getWorldPosition(new THREE.Vector3()))
          .normalize();
        const handAxis = new THREE.Vector3(0, 1, 0).transformDirection(arm.hand.matrixWorld);
        expect(THREE.MathUtils.radToDeg(forearm.angleTo(handAxis))).toBeLessThan(45);
        const card = arm.hand.getObjectByName('Закрытая карта');
        const cardRelative =
          card && arm.hand.matrixWorld.clone().invert().multiply(card.matrixWorld);
        const target = restTarget.clone().add(new THREE.Vector3(0.12, 0.2, -0.1));
        setArmTarget(arm, target);
        expect(
          person.worldToLocal(arm.wrist.getWorldPosition(new THREE.Vector3())).distanceTo(target),
        ).toBeLessThan(1e-6);
        expect(
          arm.shoulder
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(arm.elbow.getWorldPosition(new THREE.Vector3())),
        ).toBeCloseTo(2.25, 7);
        expect(
          arm.elbow
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(arm.wrist.getWorldPosition(new THREE.Vector3())),
        ).toBeCloseTo(2.35, 7);
        expect(
          arm.hand.getWorldPosition(new THREE.Vector3()).distanceTo(beforeHand),
        ).toBeGreaterThan(0.1);
        expect(difference(vertices(arm.sleeve), restSkin)).toBeGreaterThan(0.1);
        expect(difference(vertices(arm.cuff), restCuff)).toBeGreaterThan(0.1);
        expect(arm.sleeve.geometry).toBe(geometry);
        const handWrist = arm.hand.localToWorld(new THREE.Vector3(0, -0.5, 0));
        expect(handWrist.distanceTo(arm.wrist.getWorldPosition(new THREE.Vector3()))).toBeLessThan(
          1e-6,
        );
        if (card && cardRelative) {
          const relative = arm.hand.matrixWorld.clone().invert().multiply(card.matrixWorld);
          expect(
            Math.max(...relative.elements.map((v, i) => Math.abs(v - cardRelative.elements[i]))),
          ).toBeLessThan(1e-6);
        }
        setArmTarget(arm, restTarget);
        expect(difference(vertices(arm.sleeve), restSkin)).toBeLessThan(1e-6);
        expect(difference(vertices(arm.cuff), restCuff)).toBeLessThan(1e-6);
        for (const mesh of [arm.sleeve, arm.cuff]) {
          const weights = mesh.geometry.getAttribute('skinWeight');
          for (let i = 0; i < weights.count; i++) {
            const w = [0, 1, 2, 3].map((c) => weights.getComponent(i, c));
            expect(w.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
            expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
          }
        }
        arm.skeleton.computeBoneTexture();
        arm.skeleton.boneTexture!.addEventListener('dispose', () => disposed++);
      }
      const hand = person.getObjectByName('Кисть с картами') as THREE.Group;
      expect(getHandRig(hand)!.side).toBe(-1);
      expect(getHandRig(rigs[1].hand)!.side).toBe(1);
      const localPalm = new THREE.Vector3(0, 0, 1).transformDirection(
        person.matrixWorld.clone().invert().multiply(hand.matrixWorld),
      );
      expect(localPalm.dot(new THREE.Vector3(0, 0, -1))).toBeGreaterThan(0.9);
      disposeObjects(scene);
      expect(disposed).toBe(2);
    }
  });
});
