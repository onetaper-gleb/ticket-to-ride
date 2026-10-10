import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildCartoonHand, createHandAnimation, getHandRig, setHandPose } from './cartoon-hands';
import { buildDispatcher } from './characters';
import { disposeObjects } from './tabletop';

function positions(mesh: THREE.SkinnedMesh) {
  const result: number[] = [];
  const point = new THREE.Vector3();
  for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
    mesh.getVertexPosition(i, point);
    result.push(point.x, point.y, point.z);
  }
  return result;
}

function maxDistance(a: ArrayLike<number>, b: ArrayLike<number>) {
  let max = 0;
  for (let i = 0; i < a.length; i += 3)
    max = Math.max(max, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]));
  return max;
}

describe('hand animation contract', () => {
  it('has finite, normalized weights and restores bind pose after moving the whole hand', () => {
    const hand = buildCartoonHand('#cda58a', 1);
    const rig = getHandRig(hand)!;
    const geometry = rig.mesh.geometry;
    const weights = geometry.getAttribute('skinWeight');
    const indices = geometry.getAttribute('skinIndex');
    for (let i = 0; i < weights.count; i++) {
      let total = 0;
      for (let slot = 0; slot < 4; slot++) {
        const weight = weights.getComponent(i, slot),
          index = indices.getComponent(i, slot);
        expect(Number.isFinite(weight) && weight >= 0).toBe(true);
        expect(Number.isInteger(index) && index >= 0 && index < rig.skeleton.bones.length).toBe(
          true,
        );
        total += weight;
      }
      expect(Math.abs(total - 1)).toBeLessThan(1e-6);
    }
    setHandPose(hand, 'bind');
    const rest = geometry.getAttribute('position').array;
    expect(maxDistance(positions(rig.mesh), rest)).toBeLessThan(1e-6);
    hand.position.set(2, 3, -4);
    hand.rotation.set(0.2, 0.4, -0.1);
    hand.scale.setScalar(1.3);
    setHandPose(hand, 'grip');
    setHandPose(hand, 'bind');
    expect(maxDistance(positions(rig.mesh), rest)).toBeLessThan(1e-6);
    disposeObjects(hand);
  });

  it('AnimationMixer bends the same geometry and returns to the open pose', () => {
    const hand = buildCartoonHand('#cda58a', -1, false);
    const rig = getHandRig(hand)!;
    const geometry = rig.mesh.geometry,
      buffer = geometry.getAttribute('position').array;
    const original = Array.from(buffer),
      open = positions(rig.mesh);
    const mixer = new THREE.AnimationMixer(hand);
    const clip = createHandAnimation(hand, [
      { time: 0, pose: 'open' },
      { time: 1, pose: 'grip' },
      { time: 2, pose: 'open' },
    ]);
    mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
    mixer.setTime(0.5);
    hand.updateMatrixWorld(true);
    rig.skeleton.update();
    expect(maxDistance(positions(rig.mesh), open)).toBeGreaterThan(0.1);
    mixer.setTime(1);
    hand.updateMatrixWorld(true);
    rig.skeleton.update();
    const mixedGrip = positions(rig.mesh);
    setHandPose(hand, 'grip');
    expect(maxDistance(mixedGrip, positions(rig.mesh))).toBeLessThan(1e-6);
    mixer.setTime(2);
    hand.updateMatrixWorld(true);
    rig.skeleton.update();
    expect(maxDistance(positions(rig.mesh), open)).toBeLessThan(1e-6);
    expect(rig.mesh.geometry).toBe(geometry);
    expect(geometry.getAttribute('position').array).toBe(buffer);
    expect(Array.from(buffer)).toEqual(original);
    mixer.stopAllAction();
    mixer.uncacheRoot(hand);
    disposeObjects(hand);
  });

  it('keeps live hand rigs inside each finished character and disposes their bone textures', () => {
    for (let kind = 0; kind < 4; kind++) {
      const scene = new THREE.Group();
      const character = buildDispatcher(
        scene,
        {
          id: kind,
          name: 'Test',
          color: '#5588aa',
          handCount: 5,
          ticketCount: 2,
          trainsRemaining: 45,
          stationsRemaining: 3,
          stations: [],
          score: 0,
        },
        0,
        -15,
        kind,
        new THREE.Texture(),
      );
      const meshes: THREE.SkinnedMesh[] = [];
      character.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh) meshes.push(object);
      });
      expect(meshes).toHaveLength(2);
      let texturesDisposed = 0;
      for (const mesh of meshes) {
        expect(mesh.geometry.hasAttribute('skinWeight')).toBe(true);
        expect(mesh.geometry.hasAttribute('color')).toBe(true);
        mesh.skeleton.computeBoneTexture();
        mesh.skeleton.boneTexture!.addEventListener('dispose', () => texturesDisposed++);
        const bind = positions(mesh);
        mesh.skeleton.bones.find((bone) => bone.name === 'hand_index_pip')!.rotateX(0.25);
        character.updateMatrixWorld(true);
        mesh.skeleton.update();
        expect(maxDistance(positions(mesh), bind)).toBeGreaterThan(0.01);
      }
      disposeObjects(scene);
      expect(texturesDisposed).toBe(2);
    }
  });
});
