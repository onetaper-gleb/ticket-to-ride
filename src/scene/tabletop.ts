import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CardColor, Observation } from '../shared/types';
import type { TableInteraction, TableView } from './interaction';
import { buildDispatcher } from './characters';

export const railColors: Record<string, string> = {
  red: '#b54e3d',
  blue: '#4a80ab',
  green: '#4b805f',
  yellow: '#d9b44c',
  orange: '#d98643',
  purple: '#b57da5',
  black: '#33383a',
  white: '#ebe3cd',
  gray: '#89877a',
  wild: '#a68d52',
};
const cardNames: Record<CardColor, string> = {
  red: 'КРАСНЫЙ',
  blue: 'СИНИЙ',
  green: 'ЗЕЛЁНЫЙ',
  yellow: 'ЖЁЛТЫЙ',
  orange: 'ОРАНЖЕВЫЙ',
  purple: 'РОЗОВЫЙ',
  black: 'ЧЁРНЫЙ',
  white: 'БЕЛЫЙ',
  wild: 'ЛОКОМОТИВ',
};
export type MapSelection = { kind: 'station' | 'edge'; id: string } | null;
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
    marker?: THREE.Group;
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
export function cardPrint(color: CardColor, back = false, maxAnisotropy = 4) {
  const texture = textureFromCanvas((ctx) => {
    ctx.fillStyle = back ? '#263833' : '#eee5cf';
    ctx.fillRect(0, 0, 512, 768);
    ctx.strokeStyle = back ? '#c1b891' : '#ac9e7b';
    ctx.lineWidth = 4;
    ctx.strokeRect(22, 22, 468, 724);
    ctx.textAlign = 'center';
    const sans = '"IBM Plex Sans", Arial, sans-serif';
    if (back) {
      ctx.strokeStyle = '#8b967e';
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo(60, 384 + i * 38);
        ctx.lineTo(452, 384 - i * 38);
        ctx.stroke();
      }
      ctx.fillStyle = '#263833';
      ctx.fillRect(30, 280, 452, 190);
      ctx.fillStyle = '#e0d7b9';
      ctx.font = `64px ${sans}`;
      ctx.fillText('ВАГОНЫ', 256, 355);
      ctx.font = `40px ${sans}`;
      ctx.fillText('EUROPE · 1900', 256, 420);
      return;
    }
    ctx.fillStyle = '#35413a';
    ctx.font = `54px ${sans}`;
    ctx.fillText(cardNames[color], 256, 103);
    ctx.font = `42px ${sans}`;
    ctx.fillText(color === 'wild' ? 'Любой цвет' : '1 вагон', 256, 164);
    const colors =
      color === 'wild'
        ? ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'black', 'white']
        : [color];
    const stripeHeight = 235 / colors.length;
    colors.forEach((item, i) => {
      ctx.fillStyle = railColors[item];
      ctx.fillRect(68, 243 + i * stripeHeight, 376, stripeHeight + 1);
    });
    ctx.strokeStyle = '#263833';
    ctx.lineWidth = 9;
    ctx.strokeRect(68, 243, 376, 235);
    ctx.fillStyle = '#eae5d3';
    for (let i = 0; i < 4; i++) ctx.fillRect(92 + i * 87, 272, 56, 68);
    ctx.fillStyle = '#263833';
    for (const x of [138, 374]) {
      ctx.beginPath();
      ctx.arc(x, 484, 36, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(48, 530);
    ctx.lineTo(464, 530);
    ctx.stroke();
    ctx.font = `48px ${sans}`;
    ctx.fillText(color === 'wild' ? 'ЗАМЕНЯЕТ ВАГОН' : 'ЗАНЯТЬ МАРШРУТ', 256, 609);
    ctx.font = `36px ${sans}`;
    ctx.fillText(color === 'wild' ? 'Открытый: весь добор' : 'Карты одного цвета', 256, 675);
  });
  texture.anisotropy = Math.min(maxAnisotropy, 8);
  return texture;
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
  subtitle: string | string[],
  width: number,
  height: number,
  position: THREE.Vector3,
  interaction: TableInteraction,
  selected = false,
) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.x = -Math.PI / 4;
  const detailLines = Array.isArray(subtitle) ? subtitle : subtitle ? [subtitle] : [];
  const printHeight = detailLines.length ? 240 : 144;
  // Match canvas pixels to the physical face so narrow labels retain letter proportions.
  const printWidth = Math.round((printHeight * (width - 0.025)) / (height - 0.025));
  const texture = textureFromCanvas(
    (ctx) => {
      ctx.fillStyle = selected ? '#d8bc78' : '#e8dfc7';
      ctx.fillRect(0, 0, printWidth, printHeight);
      ctx.strokeStyle = '#9c927b';
      ctx.lineWidth = 3;
      ctx.strokeRect(8, 8, printWidth - 16, printHeight - 16);
      ctx.fillStyle = '#263935';
      ctx.textAlign = 'center';
      let titleSize = detailLines.length ? 62 : 76;
      ctx.font = `${titleSize}px "IBM Plex Sans", Arial, sans-serif`;
      while (titleSize > 40 && ctx.measureText(title).width > printWidth - 36) {
        titleSize -= 2;
        ctx.font = `${titleSize}px "IBM Plex Sans", Arial, sans-serif`;
      }
      ctx.fillText(title, printWidth / 2, detailLines.length ? 81 : 96);
      ctx.font = '44px "IBM Plex Sans", Arial, sans-serif';
      ctx.fillStyle = '#665e4b';
      detailLines.forEach((line, index) => ctx.fillText(line, printWidth / 2, 144 + index * 57));
    },
    printWidth,
    printHeight,
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
  const opponentCardBack = others.some((player) => player.handCount > 0)
    ? cardPrint('wild', true, eng.renderer.capabilities.getMaxAnisotropy())
    : null;
  others.forEach((player, i) =>
    buildDispatcher(
      eng.environment,
      player,
      others.length === 1 ? 0 : (i - (others.length - 1) / 2) * 10.5,
      -18.7,
      i,
      opponentCardBack,
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
  detailed = false,
) {
  disposeObjects(eng.board);
  eng.board.clear();
  eng.pickables = [];
  const { box, mesh } = primitiveFactory(eng.board);
  box([23.1, 0.45, 17.1], '#8a7751', [0, -0.95, 0]);
  const atlas = textureFromCanvas(
    (ctx) => {
      const w = 2048,
        h = 1536;
      ctx.fillStyle = '#839aa0';
      ctx.fillRect(0, 0, w, h);
      const polygon = (points: [number, number][], color: string) => {
        ctx.beginPath();
        points.forEach(([x, z], i) => {
          const px = ((x + 11.5) / 23) * w,
            py = ((z + 8.5) / 17) * h;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#697b73';
        ctx.lineWidth = 5;
        ctx.stroke();
      };
      polygon(
        [
          [-7.5, -1.7],
          [-5, -3.3],
          [-3, -3.2],
          [-2.6, -4.3],
          [-1.8, -4.3],
          [-1.4, -2.7],
          [1.2, -3.1],
          [1.3, -4.5],
          [2.5, -5.1],
          [2.8, -6.4],
          [5.5, -7.0],
          [11.5, -7.0],
          [11.5, 8.5],
          [4, 8.5],
          [2.5, 7],
          [2, 5.4],
          [0.9, 3.8],
          [-0.7, 2.8],
          [-1.1, 4],
          [-0.7, 5.3],
          [0.5, 5.4],
          [0, 6.2],
          [-1.9, 4.8],
          [-2.7, 2.9],
          [-4, 3.3],
          [-5, 5],
          [-6.7, 5.8],
          [-8.4, 7.4],
          [-10.5, 6.2],
          [-10.5, 3],
          [-7, 0.6],
        ],
        '#c9c8a4',
      );
      polygon(
        [
          [-8, -6],
          [-7, -7],
          [-6.5, -5],
          [-5.7, -3.1],
          [-7, -1.7],
          [-8, -2.4],
          [-7.5, -4],
        ],
        '#c9c8a4',
      );
      polygon(
        [
          [-2.9, -8.5],
          [0, -8.5],
          [1, -6],
          [0, -3.5],
          [-1.2, -2.8],
          [-2, -4.5],
        ],
        '#c9c8a4',
      );
      polygon(
        [
          [0.8, 3.3],
          [1.4, 4],
          [2.5, 5.5],
          [2.3, 6.5],
          [1.4, 5.4],
          [0.5, 4.5],
        ],
        '#b5b68f',
      );
      ctx.strokeStyle = '#74878b';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 128) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#4c656b';
      ctx.font = '48px "IBM Plex Mono", monospace';
      ctx.fillText('ATLAS / EUROPE', 54, 1460);
      ctx.font = '28px "IBM Plex Sans", sans-serif';
      ctx.fillText('ЖЕЛЕЗНЫЕ ДОРОГИ · 1900', 56, 1508);
    },
    2048,
    1536,
  );
  const map = new THREE.Mesh(
    new THREE.PlaneGeometry(23, 17),
    new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false }),
  );
  map.rotation.x = -Math.PI / 2;
  map.position.y = -0.7;
  eng.board.add(map);
  for (const side of [-1, 1]) {
    box([23.1, 0.11, 0.08], '#c7b786', [0, -0.62, side * 8.48]);
    box([0.08, 0.11, 17], '#c7b786', [side * 11.48, -0.62, 0]);
  }
  const cities = new Map(observation.cities.map((city) => [city.id, city]));
  for (const edge of observation.edges) {
    const a = cities.get(edge.a)!,
      b = cities.get(edge.b)!;
    const dx = b.x - a.x,
      dz = b.z - a.z,
      distance = Math.hypot(dx, dz);
    const pair = edge.parallel
      ? observation.edges.filter((other) => other.parallel === edge.parallel)
      : [edge];
    const lane = edge.parallel
      ? (pair.findIndex((other) => other.id === edge.id) - (pair.length - 1) / 2) * 0.42
      : 0;
    const x = (a.x + b.x) / 2 - (dz / distance) * lane,
      z = (a.z + b.z) / 2 + (dx / distance) * lane;
    const group = new THREE.Group();
    group.position.set(x, -0.56, z);
    group.rotation.y = Math.atan2(dx, dz);
    eng.board.add(group);
    const selected = selection?.kind === 'edge' && selection.id === edge.id;
    const color =
      edge.owner !== null
        ? observation.players.find((player) => player.id === edge.owner)!.color
        : railColors[edge.color];
    const halo = box([0.55, 0.05, Math.max(0.2, distance - 0.4)], '#e8bf67', [0, -0.06, 0], group);
    halo.userData.highlightForTable = { kind: 'edge', id: edge.id };
    halo.userData.selected = selected;
    halo.visible = selected;
    const step = Math.max(0.12, (distance - 0.48) / edge.length);
    for (let i = 0; i < edge.length; i++) {
      const at = (i - (edge.length - 1) / 2) * step;
      const sleeper = box([0.28, 0.1, step * 0.8], color, [0, 0, at], group);
      sleeper.userData.interaction = { kind: 'edge', id: edge.id };
      sleeper.userData.enabled = true;
      eng.pickables.push(sleeper);
      for (const side of [-1, 1])
        box(
          [0.035, 0.025, step * 0.75],
          edge.tunnel ? '#2d3737' : '#bdb796',
          [side * 0.09, 0.064, at],
          group,
        );
      if (edge.owner !== null) {
        box([0.25, 0.17, step * 0.64], color, [0, 0.14, at], group);
        box([0.16, 0.06, step * 0.45], '#d8c9a1', [0, 0.26, at], group);
      } else if (i < edge.ferries) {
        box([0.22, 0.06, step * 0.42], '#e7c260', [0, 0.1, at], group);
        box([0.07, 0.09, step * 0.18], '#3a4643', [0, 0.18, at], group);
      }
    }
    const hit = box([0.45, 0.08, Math.max(0.2, distance - 0.32)], '#ffffff', [0, 0.02, 0], group);
    hit.material.transparent = true;
    hit.material.opacity = 0;
    hit.material.depthWrite = false;
    hit.castShadow = false;
    hit.userData.interaction = { kind: 'edge', id: edge.id };
    hit.userData.enabled = true;
    eng.pickables.push(hit);
    if (detailed && selected) {
      const type = edge.tunnel ? ' · тоннель' : edge.ferries ? ` · паром ${edge.ferries}` : '';
      const face = placard(
        eng.board,
        `${edge.length} вагонов${type}`,
        [],
        2.4,
        0.4,
        new THREE.Vector3(x, 0.3, z),
        { kind: 'edge', id: edge.id },
        true,
      );
      eng.pickables.push(face);
    }
  }
  for (const city of observation.cities) {
    const selected = selection?.kind === 'station' && selection.id === city.id;
    const marked = view?.routeStationIds.includes(city.id);
    const pin = mesh('cylinder', [0.17, 0.16, 0.17], marked || selected ? '#d3a951' : '#635d46', [
      city.x,
      -0.35,
      city.z,
    ]);
    pin.userData.interaction = { kind: 'station', id: city.id };
    pin.userData.enabled = true;
    eng.pickables.push(pin);
    const cap = mesh('sphere', [0.16, 0.08, 0.16], '#e7d8b0', [city.x, -0.25, city.z]);
    cap.userData.interaction = { kind: 'station', id: city.id };
    cap.userData.enabled = true;
    eng.pickables.push(cap);
    const owner = observation.players.find((player) => player.stations.includes(city.id));
    if (owner) {
      const group = new THREE.Group();
      group.position.set(city.x, -0.4, city.z);
      eng.board.add(group);
      box([0.44, 0.3, 0.34], owner.color, [0, 0.21, 0], group);
      const roof = mesh('cone', [0.37, 0.25, 0.3], '#514d3b', [0, 0.5, 0], group);
      roof.rotation.y = Math.PI / 4;
      box([0.09, 0.18, 0.02], '#e3d4ae', [0, 0.18, 0.18], group);
    }
    const width = THREE.MathUtils.clamp(0.35 + city.name.length * 0.14, 1.15, 2.15);
    // Keep the one-car Amsterdam line exposed beside the Brussels nameplate.
    const labelX = city.x - (city.id === 'bruxelles' ? 0.78 : 0);
    const face = placard(
      eng.board,
      city.name,
      [],
      width,
      detailed ? 0.56 : 0.47,
      new THREE.Vector3(labelX, 0.12, city.z - (city.id === 'smolensk' ? 0.66 : 0.4)),
      { kind: 'station', id: city.id },
      !!(selected || marked),
    );
    eng.pickables.push(face);
  }
}

export function buildHand(eng: Engine, observation: Observation, selectedCardIds: string[] = []) {
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
    const fronts = new Map<CardColor, THREE.MeshBasicMaterial>();
    const backMaterial = new THREE.MeshStandardMaterial({
      map: cardPrint('wild', true, eng.renderer.capabilities.getMaxAnisotropy()),
      roughness: 1,
      side: THREE.DoubleSide,
    });
    const spacing = Math.min(0.56, 5.45 / Math.max(count - 1, 1));
    cards.forEach((card, i) => {
      const centered = i - (count - 1) / 2,
        group = new THREE.Group();
      group.position.set(centered * spacing, -3.75 - Math.abs(centered) * 0.03, centered * 0.045);
      group.rotation.z = -centered * Math.min(0.045, 0.8 / Math.max(count, 1));
      const body = new THREE.Mesh(
        cardGeometry,
        selectedCardIds.includes(card.id)
          ? new THREE.MeshBasicMaterial({ color: '#e8bc62' })
          : sideMaterial,
      );
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      let material = fronts.get(card.color);
      if (!material) {
        material = new THREE.MeshBasicMaterial({
          map: cardPrint(card.color, false, eng.renderer.capabilities.getMaxAnisotropy()),
          toneMapped: false,
        });
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
  } else {
    const group = new THREE.Group();
    group.position.set(0, -3.75, 0.12);
    const body = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedShape(1.05, 1.6, 0.055), {
        depth: 0.032,
        bevelEnabled: false,
        curveSegments: 3,
      }),
      new THREE.MeshStandardMaterial({ color: '#b6ac94', roughness: 1 }),
    );
    group.add(body);
    const texture = textureFromCanvas((ctx) => {
      ctx.fillStyle = '#ddd3bb';
      ctx.fillRect(0, 0, 512, 768);
      ctx.strokeStyle = '#9a927d';
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, 464, 720);
      ctx.fillStyle = '#505b50';
      ctx.textAlign = 'center';
      ctx.font = '44px "IBM Plex Sans", Arial, sans-serif';
      ctx.fillText('РУКА', 256, 112);
      ctx.font = '62px "IBM Plex Sans", Arial, sans-serif';
      ctx.fillText('Вагонов', 256, 347);
      ctx.fillText('нет', 256, 425);
      ctx.font = '44px "IBM Plex Sans", Arial, sans-serif';
      ctx.fillText('Возьмите карты', 256, 608);
      ctx.fillText('из колоды на столе', 256, 650);
    });
    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(1.03, 1.58),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    );
    front.position.z = 0.04;
    front.userData.cardId = 'empty-hand';
    front.userData.interaction = { kind: 'card', id: 'empty-hand' } satisfies TableInteraction;
    front.userData.enabled = false;
    group.add(front);
    eng.hand.add(group);
    eng.cardPickables.push(front);
    eng.cards.push({
      group,
      cardId: 'empty-hand',
      baseY: group.position.y,
      baseZ: group.position.z,
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
