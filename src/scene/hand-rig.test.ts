import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildCartoonHand,
  createHandAnimation,
  getHandRig,
  setHandPose,
  type HandPose,
} from './cartoon-hands';
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

function skinPatch(mesh: THREE.SkinnedMesh, include: (vertex: number) => boolean) {
  const source = mesh.geometry.getAttribute('position');
  const keys: string[][] = [];
  const vertices: number[] = [];
  for (let i = 0; i < source.count; i += 3) {
    if (![i, i + 1, i + 2].every(include)) continue;
    keys.push(
      [i, i + 1, i + 2].map((vertex) =>
        new THREE.Vector3()
          .fromBufferAttribute(source, vertex)
          .toArray()
          .map((c) => Math.round(c * 1e7))
          .join(','),
      ),
    );
    for (const vertex of [i, i + 1, i + 2])
      vertices.push(...mesh.getVertexPosition(vertex, new THREE.Vector3()).toArray());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const patch = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  patch.updateMatrixWorld(true);
  return { mesh: patch, keys };
}

function hasSkinCrossing(a: ReturnType<typeof skinPatch>, b = a) {
  const positions = a.mesh.geometry.getAttribute('position'),
    ray = new THREE.Raycaster();
  for (let face = 0; face < a.keys.length; face++)
    for (let edge = 0; edge < 3; edge++) {
      const next = (edge + 1) % 3;
      const start = new THREE.Vector3().fromBufferAttribute(positions, face * 3 + edge);
      const end = new THREE.Vector3().fromBufferAttribute(positions, face * 3 + next);
      const direction = end.sub(start),
        length = direction.length();
      if (length < 2e-6) continue;
      ray.set(start, direction.multiplyScalar(1 / length));
      ray.near = 1e-6;
      ray.far = length - 1e-6;
      if (
        ray
          .intersectObject(b.mesh)
          .some(
            (hit) =>
              !b.keys[hit.faceIndex!].some(
                (key) => key === a.keys[face][edge] || key === a.keys[face][next],
              ),
          )
      )
        return true;
    }
  return false;
}

describe('hand animation contract', () => {
  it('keeps the inner joint skin and opposing fingertips from crossing in authored grips', () => {
    const hand = buildCartoonHand('#cda58a', 1, false),
      rig = getHandRig(hand)!;
    setHandPose(hand, 'bind');
    const pivots = Object.fromEntries(
      Object.entries(rig.fingers).map(([name, chain]) => [
        name,
        chain.map((bone) => bone.getWorldPosition(new THREE.Vector3())),
      ]),
    );
    const indices = rig.mesh.geometry.getAttribute('skinIndex'),
      weights = rig.mesh.geometry.getAttribute('skinWeight');
    const boneWeight = (vertex: number, bones: readonly THREE.Bone[]) => {
      const ids = bones.map((bone) => rig.skeleton.bones.indexOf(bone));
      let weight = 0;
      for (let i = 0; i < 4; i++)
        if (ids.includes(indices.getComponent(vertex, i)))
          weight += weights.getComponent(vertex, i);
      return weight;
    };
    for (const pose of ['grip', 'fist', 'card'] as const) {
      setHandPose(hand, pose);
      for (const name of Object.keys(rig.fingers)) {
        const patch = skinPatch(
          rig.mesh,
          (vertex) =>
            new THREE.Vector3()
              .fromBufferAttribute(rig.mesh.geometry.getAttribute('position'), vertex)
              .distanceTo(pivots[name][0]) < 0.165,
        );
        expect(patch.keys.length).toBeGreaterThan(100);
        expect(hasSkinCrossing(patch), `${pose} ${name} root`).toBe(false);
        disposeObjects(patch.mesh);
      }
      for (const [name, chain] of Object.entries(rig.fingers))
        for (const joint of [1, 2]) {
          const center = pivots[name][joint],
            tangent = pivots[name][joint + 1]
              .clone()
              .sub(pivots[name][joint - 1])
              .normalize();
          const patch = skinPatch(rig.mesh, (vertex) => {
            const point = new THREE.Vector3().fromBufferAttribute(
              rig.mesh.geometry.getAttribute('position'),
              vertex,
            );
            return (
              boneWeight(vertex, chain.slice(0, 3)) > 0.8 &&
              Math.abs(point.sub(center).dot(tangent)) < 0.105
            );
          });
          expect(patch.keys.length).toBeGreaterThan(100);
          expect(hasSkinCrossing(patch), `${pose} ${name} joint ${joint}`).toBe(false);
          disposeObjects(patch.mesh);
        }
      const thumb = skinPatch(
        rig.mesh,
        (vertex) => boneWeight(vertex, [rig.fingers.thumb[2]]) > 0.98,
      );
      const index = skinPatch(
        rig.mesh,
        (vertex) => boneWeight(vertex, [rig.fingers.index[2]]) > 0.98,
      );
      expect(hasSkinCrossing(index, thumb), `${pose} opposing tips`).toBe(false);
      disposeObjects(thumb.mesh);
      disposeObjects(index.mesh);
    }
    disposeObjects(hand);
  });

  it('flexes each finger hinge towards the palm without moving the upstream dorsal shaft', () => {
    const names = ['thumb', 'index', 'middle', 'ring', 'little'] as const;
    for (const side of [-1, 1] as const) {
      const hand = buildCartoonHand('#cda58a', side, false);
      const rig = getHandRig(hand)!;
      setHandPose(hand, 'bind');
      const geometry = rig.mesh.geometry;
      const source = geometry.getAttribute('position');
      const weights = geometry.getAttribute('skinWeight');
      const indices = geometry.getAttribute('skinIndex');
      const restPoints = names.map((name) =>
        rig.fingers[name].map((bone) => bone.getWorldPosition(new THREE.Vector3())),
      );
      for (let finger = 0; finger < names.length; finger++) {
        const chain = rig.fingers[names[finger]];
        const points = restPoints[finger];
        const ids = chain.slice(0, 3).map((bone) => rig.skeleton.bones.indexOf(bone));
        for (let joint = 0; joint < 3; joint++) {
          const flexion = Array.from({ length: 5 }, () => [0, 0, 0]);
          flexion[finger][joint] = 0.45;
          setHandPose(hand, {
            curl: [0, 0, 0, 0, 0],
            flexion: flexion as unknown as HandPose['flexion'],
          });
          expect(
            chain[joint].getWorldPosition(new THREE.Vector3()).distanceTo(points[joint]),
          ).toBeLessThan(1e-7);
          expect(
            chain[joint + 1].getWorldPosition(new THREE.Vector3()).z - points[joint + 1].z,
          ).toBeGreaterThan(0.02);
          if (joint === 0) continue;
          // The dorsal shaft remains rigid; palmar skin has a wider finite compression band.
          const start = points[joint - 1],
            tangent = points[joint].clone().sub(start);
          let samples = 0;
          for (let vertex = 0; vertex < source.count; vertex++) {
            let fingerWeight = 0;
            for (let slot = 0; slot < 4; slot++)
              if (ids.includes(indices.getComponent(vertex, slot)))
                fingerWeight += weights.getComponent(vertex, slot);
            if (fingerWeight < 0.95) continue;
            const original = new THREE.Vector3().fromBufferAttribute(source, vertex);
            if (original.z > points[joint].z - 0.04) continue;
            const t = original.clone().sub(start).dot(tangent) / tangent.lengthSq();
            if (t < 0.35 || t > 0.65) continue;
            expect(
              rig.mesh.getVertexPosition(vertex, new THREE.Vector3()).distanceTo(original),
            ).toBeLessThan(1e-6);
            samples++;
          }
          expect(samples).toBeGreaterThan(8);
        }
      }
      disposeObjects(hand);
    }
  });

  it('prevents reverse finger flexion and preserves mirrored authored thumb contact poses', () => {
    const hands = [-1, 1].map((side) => buildCartoonHand('#cda58a', side as -1 | 1, false));
    const reverse: HandPose = {
      curl: [0, 0, 0, 0, 0],
      flexion: Array.from({ length: 5 }, () => [-1, -1, -1]) as unknown as HandPose['flexion'],
    };
    for (const hand of hands) {
      const rig = getHandRig(hand)!;
      setHandPose(hand, 'bind');
      const bind = positions(rig.mesh);
      setHandPose(hand, reverse);
      expect(maxDistance(positions(rig.mesh), bind)).toBeLessThan(1e-7);
      expect(rig.fingers.thumb.map((bone) => bone.name)).toEqual([
        'hand_thumb_cmc',
        'hand_thumb_mcp',
        'hand_thumb_ip',
        'hand_thumb_tip',
      ]);
      setHandPose(hand, 'fist');
    }
    const left = getHandRig(hands[0])!,
      right = getHandRig(hands[1])!;
    for (const name of ['thumb', 'index', 'middle', 'ring', 'little'] as const) {
      const a = left.fingers[name][3].getWorldPosition(new THREE.Vector3());
      const b = right.fingers[name][3].getWorldPosition(new THREE.Vector3());
      expect(a.distanceTo(new THREE.Vector3(-b.x, b.y, b.z))).toBeLessThan(1e-7);
    }
    hands.forEach(disposeObjects);
  });

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
