import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CardColor, Observation, PublicPlayer, Station } from '../shared/types';
import type { TableInteraction, TableView } from './interaction';

export const railColors: Record<string, string> = {
  red: '#a34d3c',
  blue: '#476b83',
  green: '#5c7751',
  yellow: '#b58a38',
  gray: '#777c76',
  wild: '#554d65',
};
const cardNames: Record<CardColor, string> = {
  red: 'СТАЛЬ',
  blue: 'ПИТАНИЕ',
  green: 'ДЕРЕВО',
  yellow: 'ИНСТРУМЕНТ',
  wild: 'РЕЗЕРВ',
};
export type MapSelection = { kind: 'station' | 'edge' | 'train'; id: string } | null;
export type CardMesh = { group: THREE.Group; cardId: string; baseY: number; baseZ: number };
export type Engine = {
  scene: THREE.Scene;
  foreground: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  handCamera: THREE.OrthographicCamera;
  controls: OrbitControls;
  environment: THREE.Group;
  board: THREE.Group;
  hand: THREE.Group;
  furniture: THREE.Group;
  pickables: THREE.Object3D[];
  uiPickables: THREE.Object3D[];
  hoveredInteraction: TableInteraction | null;
  pressedInteraction?: TableInteraction | null;
  animatedProps: {
    group: THREE.Group;
    interaction: TableInteraction;
    baseY: number;
    lift: number;
    enabled: boolean;
  }[];
  cardPickables: THREE.Object3D[];
  cards: CardMesh[];
  hoveredCard: string | null;
  center: THREE.Vector3;
  scale: number;
  reducedMotion: boolean;
};

// Shared geometry/materials are disposed once; CanvasTexture artwork is included.
export function disposeObjects(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.InstancedMesh) object.dispose();
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

export function roundedShape(width: number, height: number, radius: number) {
  const x = -width / 2,
    y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

export function textureFromCanvas(
  draw: (ctx: CanvasRenderingContext2D) => void,
  width = 512,
  height = 768,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Locally drawn supply documents; no downloaded illustrations or hidden font fetches.
export function cardPrint(color: CardColor, back = false) {
  return textureFromCanvas((ctx) => {
    ctx.fillStyle = back ? '#25312e' : '#e7dfcc';
    ctx.fillRect(0, 0, 512, 768);
    ctx.strokeStyle = back ? '#9eaa92' : '#b7ad98';
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, 468, 724);
    ctx.strokeRect(30, 30, 452, 708);
    if (back) {
      ctx.translate(256, 384);
      ctx.strokeStyle = '#c7c2a7';
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 42 - 145, -270);
        ctx.lineTo(i * 42 + 145, 270);
        ctx.stroke();
      }
      ctx.fillStyle = '#25312e';
      ctx.fillRect(-160, -60, 320, 120);
      ctx.strokeRect(-160, -60, 320, 120);
      ctx.fillStyle = '#d5cfb5';
      ctx.textAlign = 'center';
      ctx.font = '24px "IBM Plex Sans", Arial, sans-serif';
      ctx.fillText('РЕЧНОЙ', 0, 5);
      ctx.font = '13px "IBM Plex Mono", Consolas, monospace';
      ctx.fillText('ДИСПЕТЧЕРСКАЯ СЛУЖБА', 0, 35);
      return;
    }
    ctx.fillStyle = railColors[color];
    ctx.fillRect(34, 34, 444, 94);
    ctx.fillStyle = '#eee8d7';
    ctx.font = '28px "IBM Plex Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    const number =
      color === 'wild'
        ? '05'
        : String(['red', 'blue', 'green', 'yellow'].indexOf(color) + 1).padStart(2, '0');
    ctx.fillText('М / ' + number, 57, 75);
    ctx.font = '17px "IBM Plex Mono", Consolas, monospace';
    ctx.fillText('РЕЧНОЙ — МАТЕРИАЛЫ', 57, 104);
    ctx.fillStyle = '#292d28';
    ctx.font = '35px "IBM Plex Mono", Consolas, monospace';
    ctx.fillText(cardNames[color], 49, 182);
    ctx.strokeStyle = '#bbb19b';
    ctx.beginPath();
    ctx.moveTo(49, 205);
    ctx.lineTo(463, 205);
    ctx.stroke();
    ctx.save();
    ctx.translate(256, 396);
    ctx.strokeStyle = railColors[color];
    ctx.fillStyle = railColors[color];
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    if (color === 'red') {
      for (const x of [-80, 80]) {
        ctx.strokeRect(x - 13, -135, 26, 270);
        ctx.fillRect(x - 28, -135, 56, 13);
        ctx.fillRect(x - 28, 122, 56, 13);
      }
      for (let y = -92; y <= 92; y += 46) {
        ctx.fillStyle = '#998c72';
        ctx.fillRect(-112, y - 8, 224, 16);
      }
    } else if (color === 'blue') {
      ctx.beginPath();
      ctx.moveTo(38, -148);
      ctx.lineTo(-75, 19);
      ctx.lineTo(-8, 19);
      ctx.lineTo(-36, 148);
      ctx.lineTo(78, -24);
      ctx.lineTo(9, -24);
      ctx.closePath();
      ctx.stroke();
    } else if (color === 'green') {
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(-20 + i * 20, -60 + i * 56);
        ctx.rotate(-0.24);
        ctx.strokeRect(-118, -30, 230, 60);
        ctx.lineWidth = 2;
        for (let j = 0; j < 4; j++) {
          ctx.beginPath();
          ctx.moveTo(-98, -18 + j * 12);
          ctx.lineTo(90, -15 + j * 12);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (color === 'yellow') {
      ctx.save();
      ctx.rotate(0.55);
      ctx.strokeRect(-17, -60, 34, 204);
      ctx.beginPath();
      ctx.moveTo(-55, -143);
      ctx.lineTo(-55, -77);
      ctx.lineTo(-16, -43);
      ctx.lineTo(16, -43);
      ctx.lineTo(55, -77);
      ctx.lineTo(55, -143);
      ctx.lineTo(23, -112);
      ctx.lineTo(-23, -112);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeRect(-110, -102, 220, 204);
      ctx.strokeRect(-26, -102, 52, 204);
      ctx.beginPath();
      ctx.moveTo(-110, -22);
      ctx.lineTo(110, -22);
      ctx.stroke();
      ctx.font = '115px "IBM Plex Sans", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('+', 0, 79);
    }
    ctx.restore();
    ctx.fillStyle = '#67685e';
    ctx.textAlign = 'left';
    ctx.font = '19px "IBM Plex Mono", Consolas, monospace';
    ctx.fillText('ДЛЯ РЕМОНТА ЛИНИИ', 49, 649);
    ctx.fillText(color === 'wild' ? 'ЛЮБОЙ МАТЕРИАЛ / 1 ЕД.' : 'СКЛАДСКАЯ ЕДИНИЦА / 1', 49, 682);
    ctx.strokeStyle = '#b7ad98';
    ctx.beginPath();
    ctx.moveTo(49, 713);
    ctx.lineTo(463, 713);
    ctx.stroke();
  });
}

export function primitiveFactory(parent: THREE.Group) {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometries = new Map<string, THREE.BufferGeometry>();
  const material = (color: string, roughness = 0.85, metalness = 0) => {
    const key = `${color}-${roughness}-${metalness}`;
    let mat = materials.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.set(key, mat);
    }
    return mat;
  };
  const mesh = (
    kind: 'box' | 'sphere' | 'cylinder' | 'cone',
    size: [number, number, number],
    color: string,
    position: [number, number, number],
    target: THREE.Object3D = parent,
  ) => {
    let geometry = geometries.get(kind);
    if (!geometry) {
      geometry =
        kind === 'box'
          ? new THREE.BoxGeometry(1, 1, 1)
          : kind === 'sphere'
            ? new THREE.SphereGeometry(1, 10, 8)
            : kind === 'cylinder'
              ? new THREE.CylinderGeometry(1, 1, 1, 10)
              : new THREE.ConeGeometry(1, 1, 4);
      geometries.set(kind, geometry);
    }
    const object = new THREE.Mesh(geometry, material(color));
    object.scale.set(...size);
    object.position.set(...position);
    object.castShadow = true;
    object.receiveShadow = true;
    target.add(object);
    return object;
  };
  const box = (
    size: [number, number, number],
    color: string,
    position: [number, number, number],
    target: THREE.Object3D = parent,
  ) => mesh('box', size, color, position, target);
  return { mesh, box, material };
}

function placard(
  parent: THREE.Group,
  title: string,
  subtitle: string,
  width: number,
  height: number,
  position: THREE.Vector3,
  interaction: TableInteraction,
  selected = false,
) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.x = -Math.PI / 4;
  const texture = textureFromCanvas(
    (ctx) => {
      ctx.fillStyle = selected ? '#d8bc78' : '#e8dfc7';
      ctx.fillRect(0, 0, 512, 192);
      ctx.strokeStyle = '#9c927b';
      ctx.lineWidth = 3;
      ctx.strokeRect(7, 7, 498, 178);
      ctx.fillStyle = '#263935';
      ctx.textAlign = 'center';
      ctx.font = '62px "IBM Plex Sans", Arial, sans-serif';
      ctx.fillText(title, 256, 81, 476);
      ctx.font = '50px "IBM Plex Mono", Consolas, monospace';
      ctx.fillStyle = '#665e4b';
      ctx.fillText(subtitle, 256, 151, 476);
    },
    512,
    192,
  );
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.055),
    new THREE.MeshStandardMaterial({ color: '#847b63', roughness: 0.95 }),
  );
  backing.castShadow = true;
  group.add(backing);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.025, height - 0.025),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  face.position.z = 0.029;
  face.userData.interaction = interaction;
  face.userData.enabled = true;
  group.add(face);
  parent.add(group);
  return face;
}

function buildDispatcher(
  parent: THREE.Group,
  player: PublicPlayer,
  x: number,
  z: number,
  index: number,
) {
  const factory = primitiveFactory(parent);
  const person = new THREE.Group();
  person.position.set(x, -0.45, z);
  person.rotation.y = Math.atan2(-x, -z);
  parent.add(person);
  const skin = ['#bd8f70', '#d5b296', '#896a53'][index % 3],
    cloth = ['#39484a', '#525a43', '#4c4146'][index % 3];
  factory.box([2.8, 2.5, 0.6], '#292d28', [0, 0.2, -0.65], person);
  factory.mesh('sphere', [1.32, 1.7, 0.8], cloth, [0, 1, 0], person);
  factory.box([0.7, 0.09, 0.75], player.color, [0, 2.2, 0.56], person);
  factory.mesh('cylinder', [0.28, 0.45, 0.28], skin, [0, 2.45, 0.08], person);
  factory.mesh('sphere', [0.75, 0.88, 0.66], skin, [0, 3.23, 0.08], person);
  factory.mesh('sphere', [0.15, 0.17, 0.16], skin, [0, 3.25, 0.72], person);
  for (const side of [-1, 1]) {
    factory.mesh('sphere', [0.12, 0.23, 0.13], skin, [side * 0.74, 3.21, 0.02], person);
    factory.box([0.07, 0.075, 0.035], '#2b2b25', [side * 0.26, 3.43, 0.68], person);
    const arm = factory.mesh(
      'cylinder',
      [0.3, 1.55, 0.3],
      cloth,
      [side * 1.03, 0.66, 0.88],
      person,
    );
    arm.rotation.x = -0.72;
    arm.rotation.z = side * 0.27;
    factory.mesh('sphere', [0.29, 0.15, 0.41], skin, [side * 0.81, 0.17, 1.52], person);
    for (let finger = 0; finger < 3; finger++)
      factory.mesh(
        'cylinder',
        [0.052, 0.28, 0.052],
        skin,
        [side * 0.8 + finger * 0.085, 0.17, 1.75],
        person,
      ).rotation.x = Math.PI / 2;
  }
  factory.box([0.42, 0.055, 0.03], '#775d4b', [0, 2.91, 0.64], person);
  factory.mesh('cylinder', [0.85, 0.24, 0.75], cloth, [0, 4.02, 0.06], person);
  factory.box([1.44, 0.07, 0.85], '#2a3334', [0, 3.89, 0.51], person);
  factory.box([0.28, 0.13, 0.04], '#b6a773', [0, 4.01, 0.79], person);
  if (player.handCount > 0) {
    const backMaterial = new THREE.MeshStandardMaterial({
      map: cardPrint('wild', true),
      roughness: 1,
    });
    const cardGeometry = new THREE.BoxGeometry(0.64, 0.94, 0.045);
    for (let i = 0; i < Math.min(4, player.handCount); i++) {
      const card = new THREE.Mesh(cardGeometry, backMaterial);
      card.position.set((i - 1.5) * 0.35, 0.63, 1.72);
      card.rotation.set(-0.32, 0, (i - 1.5) * -0.12);
      card.castShadow = true;
      person.add(card);
    }
  }
}

export function buildEnvironment(eng: Engine, observation: Observation) {
  disposeObjects(eng.environment);
  eng.environment.clear();
  const { box, mesh, material } = primitiveFactory(eng.environment);
  box([95, 0.5, 95], '#1b2628', [0, -8, 0]);
  box([75, 28, 0.6], '#283536', [0, 6, -31]);
  box([0.6, 28, 80], '#222d2f', [-35, 6, 0]);
  box([39, 1.4, 39], '#3e3026', [0, -2.15, 0]);
  box([38.5, 0.09, 38.5], '#6b5038', [0, -1.4, 0]);
  for (let plank = -4; plank <= 4; plank++)
    box([0.022, 0.007, 38.3], '#352b25', [plank * 4.25, -1.346, 0]);
  for (const side of [-1, 1]) {
    box([0.1, 0.06, 38.4], '#978260', [side * 19.05, -1.34, 0]);
    box([38.1, 0.06, 0.1], '#978260', [0, -1.34, side * 19.05]);
    box([1.5, 6, 1.5], '#2d2923', [side * 16, -5.2, -15]);
  }
  const lamp = new THREE.Group();
  lamp.position.set(-16, -1.3, -13);
  eng.environment.add(lamp);
  mesh('cylinder', [1.3, 0.16, 1.3], '#303939', [0, 0.09, 0], lamp);
  mesh('cylinder', [0.11, 5.6, 0.11], '#343f3e', [0, 2.85, 0], lamp);
  const lampShade = new THREE.Mesh(
    new THREE.ConeGeometry(1.85, 1.3, 24, 1, true),
    material('#56664c'),
  );
  lampShade.position.set(0.75, 5.2, 0.9);
  lampShade.rotation.z = -0.33;
  lamp.add(lampShade);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 10, 8),
    new THREE.MeshBasicMaterial({ color: '#ffdea7' }),
  );
  bulb.position.set(0.75, 4.85, 0.9);
  lamp.add(bulb);
  // Only public opponents reach this scene, and only card backs are rendered.
  const others = observation.players.filter((player) => player.id !== observation.self.id);
  others.forEach((player, i) =>
    buildDispatcher(
      eng.environment,
      player,
      others.length === 1 ? 0 : (i - (others.length - 1) / 2) * 10.5,
      -18.7,
      i,
    ),
  );
  box([2.3, 0.12, 1.55], '#b2a78d', [15.5, -1.24, -11.8]);
  box([2.3, 0.1, 1.55], '#d3c6a9', [15.4, -1.12, -11.7]).rotation.y = -0.11;
  box([0.12, 0.12, 2.3], '#6d4431', [14.8, -0.97, -12.1]).rotation.y = -0.5;
}

export function buildBoard(
  eng: Engine,
  observation: Observation,
  selection: MapSelection,
  view?: TableView,
) {
  disposeObjects(eng.board);
  eng.board.clear();
  eng.board.scale.set(0.74, 1, 0.74);
  eng.board.position.set(0, 0, -1.8);
  eng.pickables = [];
  const xs = observation.stations.map((station) => station.x),
    zs = observation.stations.map((station) => station.z);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1);
  eng.center.set(
    (Math.max(...xs) + Math.min(...xs)) / 2,
    0,
    (Math.max(...zs) + Math.min(...zs)) / 2,
  );
  eng.scale = 23 / span;
  const point = (station: Station) =>
    new THREE.Vector3(
      (station.x - eng.center.x) * eng.scale,
      station.height * 0.65,
      (station.z - eng.center.z) * eng.scale,
    );
  const { box, mesh, material } = primitiveFactory(eng.board);
  const baseGeometry = new THREE.ExtrudeGeometry(roundedShape(25, 29, 0.8), {
    depth: 0.45,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.12,
    bevelSegments: 2,
    curveSegments: 5,
  });
  const base = new THREE.Mesh(baseGeometry, material('#c1b797'));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -1.18;
  base.receiveShadow = true;
  base.castShadow = true;
  eng.board.add(base);
  box([23.7, 0.17, 27.7], '#e0d8c0', [0, -0.58, 0]);
  for (const band of [
    { z: -8.2, depth: 7.8, height: 1.17, color: '#c4c2a1' },
    { z: -1.75, depth: 5.0, height: 0.8, color: '#cac7ae' },
    { z: 4.1, depth: 6.7, height: 0.48, color: '#d3cdb7' },
    { z: 9.9, depth: 4.9, height: 0.19, color: '#c7c1b0' },
  ])
    box([23.1, band.height + 0.5, band.depth], band.color, [0, (band.height - 0.5) / 2, band.z]);
  const flooded = observation.stations.filter((station) => station.flooded);
  const waterHeight = flooded.length
    ? Math.max(...flooded.map((station) => station.height * 0.65)) + 0.19
    : -0.42;
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(24, 0.07, 28.1),
    new THREE.MeshStandardMaterial({
      color: '#4e8c92',
      transparent: true,
      opacity: flooded.length ? 0.72 : 0.45,
      metalness: 0.1,
      roughness: 0.33,
      depthWrite: false,
    }),
  );
  water.position.y = waterHeight;
  eng.board.add(water);
  box([0.5, 0.025, 26.4], '#9cafa2', [10.95, 0.11, 0]);
  box([0.35, 0.035, 3.2], '#779da0', [-10.8, 0.19, 10.3]);
  const tieTransforms: THREE.Matrix4[] = [];
  const railBatches = new Map<string, THREE.Matrix4[]>();
  const dummy = new THREE.Object3D();
  for (const edge of observation.edges) {
    const a = observation.stations.find((station) => station.id === edge.a),
      b = observation.stations.find((station) => station.id === edge.b);
    if (!a || !b) continue;
    const pa = point(a).add(new THREE.Vector3(0, 0.18, 0)),
      pb = point(b).add(new THREE.Vector3(0, 0.18, 0));
    const direction = pb.clone().sub(pa),
      distance = direction.length(),
      side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const closed = a.flooded || b.flooded,
      selected =
        (selection?.kind === 'edge' && selection.id === edge.id) ||
        Boolean(
          view?.routeStationIds.some(
            (id, index, route) =>
              (id === edge.a && route[index + 1] === edge.b) ||
              (id === edge.b && route[index + 1] === edge.a),
          ),
        );
    const color = selected
      ? '#d6b968'
      : closed
        ? '#687e7b'
        : edge.open
          ? '#c0b7a0'
          : railColors[edge.color];
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );
    const midpoint = pa.clone().lerp(pb, 0.5),
      transforms = railBatches.get(color) ?? [];
    for (const sign of [-1, 1]) {
      dummy.position.copy(midpoint).addScaledVector(side, sign * 0.11);
      dummy.quaternion.copy(quaternion);
      dummy.scale.set(edge.open ? 0.043 : 0.027, distance, edge.open ? 0.043 : 0.027);
      dummy.updateMatrix();
      transforms.push(dummy.matrix.clone());
    }
    railBatches.set(color, transforms);
    const tieCount = Math.max(3, Math.floor(distance * 2.1));
    for (let i = 0; i < tieCount; i++) {
      if (!edge.open && i % 3 !== 0) continue;
      dummy.position.copy(pa.clone().lerp(pb, (i + 0.5) / tieCount));
      dummy.position.y -= 0.04;
      dummy.rotation.set(0, -Math.atan2(direction.z, direction.x), 0);
      dummy.scale.set(0.13, 0.065, 0.53);
      dummy.updateMatrix();
      tieTransforms.push(dummy.matrix.clone());
    }
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, distance, 5),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
    );
    hit.position.copy(midpoint);
    hit.quaternion.copy(quaternion);
    hit.userData.selection = { kind: 'edge', id: edge.id };
    hit.userData.interaction = { kind: 'edge', id: edge.id } satisfies TableInteraction;
    hit.userData.enabled = true;
    eng.board.add(hit);
    eng.pickables.push(hit);
    if (!edge.open && !closed) {
      const marker = mesh('cylinder', [0.19, 0.095, 0.19], railColors[edge.color], [
        midpoint.x,
        midpoint.y + 0.06,
        midpoint.z,
      ]);
      marker.userData.selection = { kind: 'edge', id: edge.id };
      marker.userData.interaction = hit.userData.interaction;
      marker.userData.enabled = true;
      eng.pickables.push(marker);
      for (let i = 0; i < edge.cost; i++)
        mesh('sphere', [0.043, 0.043, 0.043], '#eee7d3', [
          midpoint.x + (i - (edge.cost - 1) / 2) * 0.1,
          midpoint.y + 0.145,
          midpoint.z,
        ]);
    }
  }
  const ties = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material('#5c5544'),
    tieTransforms.length,
  );
  tieTransforms.forEach((transform, index) => ties.setMatrixAt(index, transform));
  ties.castShadow = true;
  ties.receiveShadow = true;
  eng.board.add(ties);
  for (const [color, transforms] of railBatches) {
    const rails = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 5),
      material(color, 0.6, 0.22),
      transforms.length,
    );
    transforms.forEach((transform, index) => rails.setMatrixAt(index, transform));
    rails.castShadow = true;
    eng.board.add(rails);
  }
  for (const station of observation.stations) {
    const p = point(station),
      level = p.y;
    const platform = box(
      [1.9, 0.17, 1.05],
      station.flooded ? '#728985' : station.safe ? '#b5a16b' : '#b8af98',
      [p.x, level + 0.14, p.z],
    );
    platform.userData.selection = { kind: 'station', id: station.id };
    platform.userData.interaction = { kind: 'station', id: station.id } satisfies TableInteraction;
    platform.userData.enabled = true;
    eng.pickables.push(platform);
    const target = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.35, 1.8),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
    );
    target.position.set(p.x, level + 0.6, p.z - 0.28);
    target.userData.selection = platform.userData.selection;
    target.userData.interaction = platform.userData.interaction;
    target.userData.enabled = true;
    eng.board.add(target);
    eng.pickables.push(target);
    const buildingColor = station.flooded ? '#70817a' : station.safe ? '#e2d6b4' : '#d3c6a7';
    box([0.72, 0.58, 0.63], buildingColor, [p.x - 0.35, level + 0.5, p.z - 0.54]);
    const roof = mesh('cone', [0.59, 0.34, 0.52], station.flooded ? '#637774' : '#697268', [
      p.x - 0.35,
      level + 0.98,
      p.z - 0.54,
    ]);
    roof.rotation.y = Math.PI / 4;
    box([0.13, 0.25, 0.018], '#677067', [p.x - 0.35, level + 0.42, p.z - 0.22]);
    for (const x of [-0.22, 0.22])
      box([0.1, 0.14, 0.02], '#8e997f', [p.x - 0.35 + x, level + 0.6, p.z - 0.22]);
    if (station.safe) {
      const tower = box([0.46, 0.96, 0.4], '#d4c7a5', [p.x + 0.57, level + 0.65, p.z - 0.53]);
      const flag = box([0.3, 0.18, 0.035], '#758654', [p.x + 0.74, level + 1.49, p.z - 0.51]);
      tower.userData.selection = platform.userData.selection;
      eng.pickables.push(tower, flag);
      mesh('cylinder', [0.023, 0.66, 0.023], '#756f5c', [p.x + 0.57, level + 1.39, p.z - 0.51]);
    } else if (!station.flooded) {
      box([0.45, 0.39, 0.48], '#b5b394', [p.x + 1.1, level + 0.31, p.z - 0.32]).rotation.y = 0.12;
      mesh('cone', [0.37, 0.25, 0.4], '#7a7663', [p.x + 1.1, level + 0.64, p.z - 0.32]).rotation.y =
        Math.PI / 4;
      if (station.district === 'garden') {
        mesh('cylinder', [0.04, 0.34, 0.04], '#84735a', [p.x + 1.25, level + 0.29, p.z + 0.75]);
        mesh('sphere', [0.27, 0.4, 0.27], '#819068', [p.x + 1.25, level + 0.66, p.z + 0.75]);
      }
    }
    station.groups.forEach((group, index) => {
      const x = p.x + 0.35 + (index % 2) * 0.25,
        z = p.z + 0.11 + Math.floor(index / 2) * 0.3;
      mesh('cylinder', [0.085, 0.23, 0.085], group.priority ? '#ae7139' : '#687764', [
        x,
        level + 0.37,
        z,
      ]);
      mesh('sphere', [0.086, 0.086, 0.086], '#d4b696', [x, level + 0.56, z]);
    });
    const stationSelected = selection?.kind === 'station' && selection.id === station.id;
    const stationOnRoute = view?.routeStationIds.includes(station.id) ?? false;
    const plate = placard(
      eng.board,
      station.name,
      station.safe
        ? 'УБЕЖИЩЕ'
        : station.flooded
          ? 'ЗАКРЫТА'
          : `${station.groups.length} ГР. · ВОЛНА ${station.floodRound}`,
      3.2,
      0.7,
      new THREE.Vector3(p.x, level + 0.55, p.z + 1.26),
      platform.userData.interaction as TableInteraction,
      stationSelected,
    );
    eng.pickables.push(plate);
    {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.15, 0.045, 5, 42),
        new THREE.MeshBasicMaterial({ color: stationOnRoute ? '#ebba4b' : '#c89940' }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(p.x, level + 0.28, p.z);
      ring.userData.highlightForTable = platform.userData.interaction;
      ring.userData.selected = stationSelected || stationOnRoute;
      ring.visible = stationSelected || stationOnRoute;
      eng.board.add(ring);
    }
    if (!station.safe) {
      mesh('cylinder', [0.025, 0.57, 0.025], '#7c7764', [p.x - 1, level + 0.45, p.z + 0.2]);
      box([0.28, 0.2, 0.045], station.flooded ? '#59777c' : '#b5844f', [
        p.x - 1,
        level + 0.67,
        p.z + 0.2,
      ]);
    }
  }
  for (const train of observation.trains) {
    const station = observation.stations.find((item) => item.id === train.stationId);
    if (!station) continue;
    const p = point(station),
      peers = observation.trains.filter((item) => item.stationId === station.id),
      index = peers.findIndex((item) => item.id === train.id);
    const rowSize = Math.min(4, peers.length);
    const x = p.x + ((index % 4) - (rowSize - 1) / 2) * 1.15,
      z = p.z + 0.7 + Math.floor(index / 4) * 1.35,
      y = p.y + 0.31;
    const color = train.disabled
      ? '#6a807b'
      : (observation.players.find((player) => player.id === train.playerId)?.color ?? '#ddd7bb');
    const own = train.playerId === observation.self.id;
    const trainGroup = new THREE.Group();
    trainGroup.position.set(x, y, z);
    trainGroup.scale.setScalar(own ? 2.2 : 1.65);
    eng.board.add(trainGroup);
    const body = box([0.33, 0.26, 0.64], color, [0, 0.2, 0], trainGroup);
    box([0.29, 0.27, 0.22], color, [0, 0.36, -0.15], trainGroup);
    box([0.22, 0.12, 0.018], '#3e5252', [0, 0.4, -0.27], trainGroup);
    mesh('cylinder', [0.035, 0.14, 0.035], '#354344', [0, 0.43, 0.14], trainGroup);
    for (const side of [-1, 1])
      for (const dz of [-0.18, 0.18])
        mesh(
          'cylinder',
          [0.08, 0.06, 0.08],
          '#354344',
          [side * 0.185, 0.08, dz],
          trainGroup,
        ).rotation.z = Math.PI / 2;
    train.cargo.forEach((group, cargoIndex) =>
      box(
        [0.115, 0.1, 0.11],
        group.priority ? '#d6a657' : '#d4c6a0',
        [(cargoIndex - 0.5) * 0.13, 0.39, 0.15],
        trainGroup,
      ),
    );
    const trainInteraction: TableInteraction = { kind: 'train', id: train.id };
    body.userData.interaction = trainInteraction;
    body.userData.enabled = true;
    eng.pickables.push(body);
    const trainHit = new THREE.Mesh(
      new THREE.BoxGeometry(0.53, 0.7, 0.84),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
    );
    trainHit.position.y = 0.29;
    trainHit.userData.interaction = trainInteraction;
    trainHit.userData.enabled = true;
    trainGroup.add(trainHit);
    eng.pickables.push(trainHit);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.43, 0.045, 5, 24),
      new THREE.MeshBasicMaterial({ color: '#ecc566' }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.07;
    halo.userData.highlightForTable = trainInteraction;
    halo.userData.selected = view?.selectedTrainId === train.id;
    halo.visible = Boolean(halo.userData.selected);
    trainGroup.add(halo);
    if (own) {
      const tag = placard(
        trainGroup,
        train.id.split('-').at(-1)?.toUpperCase() ?? train.id,
        `${train.cargo.length}/2`,
        0.8,
        0.38,
        new THREE.Vector3(0, 0.93, 0),
        trainInteraction,
        view?.selectedTrainId === train.id,
      );
      eng.pickables.push(tag);
    }
    trainGroup.traverse((object) => {
      if (object instanceof THREE.Mesh && object !== halo) {
        object.userData.interaction = trainInteraction;
        object.userData.enabled = true;
      }
    });
  }
}

export function buildHand(eng: Engine, observation: Observation) {
  disposeObjects(eng.hand);
  eng.hand.clear();
  eng.cardPickables = [];
  eng.cards = [];
  const cards = observation.self.hand,
    count = cards.length;
  if (count > 0) {
    const cardGeometry = new THREE.ExtrudeGeometry(roundedShape(1.05, 1.6, 0.055), {
      depth: 0.032,
      bevelEnabled: true,
      bevelThickness: 0.009,
      bevelSize: 0.009,
      bevelSegments: 1,
      curveSegments: 3,
    });
    const frontGeometry = new THREE.ShapeGeometry(roundedShape(1.03, 1.58, 0.05), 3);
    // ShapeGeometry defaults to world coordinates; artwork needs the entire 0..1 page.
    // The reverse face shares this geometry and therefore receives the same corrected UVs.
    const positions = frontGeometry.getAttribute('position');
    const uv = frontGeometry.getAttribute('uv');
    for (let vertex = 0; vertex < positions.count; vertex++)
      uv.setXY(
        vertex,
        (positions.getX(vertex) + 0.515) / 1.03,
        (positions.getY(vertex) + 0.79) / 1.58,
      );
    uv.needsUpdate = true;
    const sideMaterial = new THREE.MeshStandardMaterial({ color: '#bfb59e', roughness: 1 });
    const fronts = new Map<CardColor, THREE.MeshStandardMaterial>();
    const backMaterial = new THREE.MeshStandardMaterial({
      map: cardPrint('wild', true),
      roughness: 1,
      side: THREE.DoubleSide,
    });
    const spacing = Math.min(0.56, 5.45 / Math.max(count - 1, 1));
    cards.forEach((card, i) => {
      const centered = i - (count - 1) / 2,
        group = new THREE.Group();
      group.position.set(centered * spacing, -3.75 - Math.abs(centered) * 0.03, centered * 0.045);
      group.rotation.z = -centered * 0.045;
      const body = new THREE.Mesh(cardGeometry, sideMaterial);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      let material = fronts.get(card.color);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ map: cardPrint(card.color), roughness: 1 });
        fronts.set(card.color, material);
      }
      const front = new THREE.Mesh(frontGeometry, material);
      front.position.z = 0.043;
      front.userData.cardId = card.id;
      front.userData.interaction = { kind: 'card', id: card.id } satisfies TableInteraction;
      front.userData.enabled = true;
      group.add(front);
      const back = new THREE.Mesh(frontGeometry, backMaterial);
      back.position.z = -0.012;
      back.rotation.y = Math.PI;
      group.add(back);
      eng.hand.add(group);
      eng.cardPickables.push(front);
      eng.cards.push({ group, cardId: card.id, baseY: group.position.y, baseZ: group.position.z });
    });
  }
  const { mesh, box } = primitiveFactory(eng.hand);
  for (const side of [-1, 1]) {
    const hand = new THREE.Group();
    hand.position.set(side * (count > 7 ? 2.25 : 1.84), -4.72, 0.48);
    hand.rotation.z = side * -0.2;
    eng.hand.add(hand);
    box([0.9, 0.85, 0.43], '#344648', [side * 0.08, -0.51, -0.03], hand);
    box([0.85, 0.16, 0.46], '#c3c7b1', [side * 0.04, -0.14, 0], hand);
    mesh('sphere', [0.44, 0.49, 0.2], '#c8a583', [0, 0.21, 0.09], hand);
    for (let i = 0; i < 4; i++) {
      mesh(
        'cylinder',
        [0.069, 0.52 - Math.abs(i - 1.5) * 0.07, 0.08],
        '#c6a180',
        [side * (-0.28 + i * 0.17), 0.51, 0.11],
        hand,
      ).rotation.z = side * -0.1;
      mesh(
        'sphere',
        [0.07, 0.075, 0.08],
        '#c6a180',
        [side * (-0.28 + i * 0.17), 0.74 - Math.abs(i - 1.5) * 0.07, 0.11],
        hand,
      );
    }
    mesh('sphere', [0.14, 0.34, 0.12], '#d0ad8a', [-side * 0.32, 0.45, 0.59], hand).rotation.z =
      side * -0.45;
  }
}
