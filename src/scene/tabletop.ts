import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CardColor, Observation } from '../shared/types';
import type { TableInteraction, TableView } from './interaction';
import { buildDispatcher } from './characters';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TABLE_LAYOUT } from './table-layout';
import { presentationCities, routeLayouts, cityLabels } from './board-layout';
import { renderEuropeAtlas } from './europe-atlas';
import { createRailMiniatures } from './rail-miniatures';
import { drawTrainCard } from './card-art';
import { batchRailMiniatures } from './rail-batching';
import { buildPlayerReserve } from './player-reserve';
import { createBoardRouteTargets } from './board-pick-targets';
import { printBoardLayout } from './board-print';

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
  routePickCenters: Map<string, THREE.Vector3[]>;
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

export function cardPrint(color: CardColor, back = false, maxAnisotropy = 4) {
  const texture = textureFromCanvas(
    (ctx) => drawTrainCard(ctx, color, back, 1024, 1536, railColors),
    1024,
    1536,
  );
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
  const { width, depth } = TABLE_LAYOUT.table;
  const wood = textureFromCanvas(
    (ctx) => {
      ctx.fillStyle = '#614936';
      ctx.fillRect(0, 0, 1024, 1024);
      for (let row = 0; row < 1024; row += 3) {
        const shade = Math.round(53 + Math.sin(row * 0.019) * 9 + Math.sin(row * 0.13) * 4);
        ctx.strokeStyle = `rgba(${shade},${shade - 10},${shade - 20},.22)`;
        ctx.lineWidth = 1 + (row % 7) * 0.25;
        ctx.beginPath();
        for (let x = 0; x <= 1024; x += 16) {
          const y = row + Math.sin(x * 0.011 + row * 0.004) * 3;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    },
    1024,
    1024,
  );
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.repeat.set(2, 1.5);
  wood.anisotropy = Math.min(eng.renderer.capabilities.getMaxAnisotropy(), 8);
  const table = new THREE.Mesh(
    new RoundedBoxGeometry(width, 1.4, depth, 3, 0.25),
    new THREE.MeshStandardMaterial({ color: '#d6c4a5', map: wood, roughness: 0.7 }),
  );
  table.position.y = -2.15;
  table.receiveShadow = true;
  table.castShadow = true;
  eng.environment.add(table);
  for (let plank = -3; plank <= 3; plank++)
    box([width - 0.7, 0.012, 0.025], '#3c3027', [0, -1.443, plank * 4.15]);
  for (const side of [-1, 1]) {
    box([0.08, 0.03, depth - 0.8], '#978260', [side * (width / 2 - 0.4), -1.425, 0]);
    box([width - 0.8, 0.03, 0.08], '#978260', [0, -1.425, side * (depth / 2 - 0.4)]);
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
  buildPlayerReserve(eng.environment, observation);
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
  eng.routePickCenters.clear();
  const { box, mesh } = primitiveFactory(eng.board);
  const cities = presentationCities(observation.cities);
  const routes = routeLayouts(observation.edges, cities);
  const labels = cityLabels(cities, routes);
  const width = TABLE_LAYOUT.board.width,
    depth = TABLE_LAYOUT.board.depth;
  const frame = new THREE.Mesh(
    new RoundedBoxGeometry(width + 0.5, 0.34, depth + 0.5, 3, 0.09),
    new THREE.MeshStandardMaterial({ color: '#574735', roughness: 0.48 }),
  );
  frame.position.y = -0.98;
  frame.castShadow = true;
  frame.receiveShadow = true;
  eng.board.add(frame);
  for (const side of [-1, 1]) {
    box([width + 0.23, 0.02, 0.035], '#b09a69', [0, -0.8, side * (depth / 2 + 0.1)]);
    box([0.035, 0.02, depth + 0.23], '#b09a69', [side * (width / 2 + 0.1), -0.8, 0]);
  }
  const atlas = textureFromCanvas(
    (ctx) => {
      const w = 3072,
        h = 2048;
      renderEuropeAtlas(ctx, w, h);
      printBoardLayout(ctx, w, h, width, depth, routes, labels, railColors, selection, view);
    },
    3072,
    2048,
  );
  atlas.anisotropy = Math.min(eng.renderer.capabilities.getMaxAnisotropy(), 8);
  const map = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.96, metalness: 0 }),
  );
  map.rotation.x = -Math.PI / 2;
  map.position.y = -0.796;
  map.receiveShadow = true;
  eng.board.add(map);
  const models = createRailMiniatures();
  const miniatureGroups: THREE.Group[] = [];
  const hitMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
  });
  for (const route of routes) {
    const { edge } = route;
    eng.routePickCenters.set(
      edge.id,
      route.slots.map(
        (slot) =>
          new THREE.Vector3(
            slot.position.x,
            edge.owner === null
              ? -0.754
              : -0.745 + (0.2232 / 0.3) * 0.283 * (route.coachLength / 0.62),
            slot.position.z,
          ),
      ),
    );
    const selected = selection?.kind === 'edge' && selection.id === edge.id;
    const group = new THREE.Group();
    eng.board.add(group);
    group.position.y = -0.77;
    const halo = createBoardRouteTargets(
      { ...route, slots: [] },
      new THREE.MeshBasicMaterial({
        color: '#ddb458',
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      { surfaceY: -0.025, linkWidth: 0.09 },
    )[0]!;
    halo.userData.highlightForTable = { kind: 'edge', id: edge.id };
    halo.userData.selected = selected;
    halo.visible = selected;
    group.add(halo);
    route.slots.forEach((slot, index) => {
      const unit = models.addTrackSlot(
        group,
        railColors[edge.color]!,
        0.62,
        0.2852,
        edge.tunnel,
        index < edge.ferries,
      );
      unit.scale.setScalar(route.coachLength / 0.62);
      miniatureGroups.push(unit);
      unit.position.set(slot.position.x, 0, slot.position.z);
      unit.rotation.y = slot.angle;
      unit.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.userData.interaction = { kind: 'edge', id: edge.id };
          object.userData.enabled = true;
          eng.pickables.push(object);
        }
      });
      if (edge.owner !== null) {
        const color = observation.players.find((player) => player.id === edge.owner)!.color;
        const coach = models.addCoach(group, color, 0.62, 0.2232);
        coach.scale.setScalar(route.coachLength / 0.62);
        miniatureGroups.push(coach);
        coach.position.set(slot.position.x, 0.025, slot.position.z);
        coach.rotation.y = slot.angle;
        coach.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.userData.interaction = { kind: 'edge', id: edge.id };
            object.userData.enabled = true;
            eng.pickables.push(object);
          }
        });
      }
    });
    const targets = createBoardRouteTargets(route, hitMaterial);
    group.add(...targets);
    eng.pickables.push(...targets);
    if (detailed && selected) {
      const extra = edge.tunnel ? ' · тоннель' : edge.ferries ? ` · паром ${edge.ferries}` : '';
      const price =
        edge.length === 1 ? '1 карта' : `${edge.length} ${edge.length < 5 ? 'карты' : 'карт'}`;
      const face = placard(
        eng.board,
        `${price}${extra}`,
        [],
        2.25,
        0.4,
        new THREE.Vector3(8.5, -0.55, depth / 2 + 0.4),
        { kind: 'edge', id: edge.id },
        true,
      );
      eng.pickables.push(face);
    }
  }
  const batched = batchRailMiniatures(eng.board, miniatureGroups);
  const removed = new Set(batched.removed);
  eng.pickables = eng.pickables.filter((object) => !removed.has(object));
  eng.pickables.push(...batched.meshes);
  for (const label of labels) {
    const target = new THREE.Mesh(new THREE.PlaneGeometry(label.width, label.height), hitMaterial);
    target.rotation.x = -Math.PI / 2;
    target.position.set(label.x, -0.795, label.z);
    target.userData.interaction = { kind: 'station', id: label.city.id };
    target.userData.cityLabel = true;
    target.userData.enabled = true;
    target.visible = false;
    eng.board.add(target);
    eng.pickables.push(target);
  }
  for (const city of cities) {
    const selected = selection?.kind === 'station' && selection.id === city.id;
    const marked = view?.routeStationIds.includes(city.id);
    const pin = mesh('cylinder', [0.16, 0.035, 0.16], marked || selected ? '#d0a855' : '#aa9265', [
      city.x,
      -0.744,
      city.z,
    ]);
    const cap = mesh('cylinder', [0.1, 0.038, 0.1], '#ebdec2', [city.x, -0.717, city.z]);
    for (const part of [pin, cap]) {
      part.userData.interaction = { kind: 'station', id: city.id };
      part.userData.enabled = true;
      eng.pickables.push(part);
    }
    const target = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16), hitMaterial);
    target.position.set(city.x, -0.705, city.z);
    target.userData.interaction = { kind: 'station', id: city.id };
    target.userData.boardPickTarget = 'city';
    target.userData.enabled = true;
    target.visible = false;
    eng.board.add(target);
    eng.pickables.push(target);
    const owner = observation.players.find((player) => player.stations.includes(city.id));
    if (owner) {
      const group = new THREE.Group();
      group.position.set(city.x, -0.71, city.z);
      eng.board.add(group);
      const station = new THREE.Mesh(
        new RoundedBoxGeometry(0.38, 0.25, 0.3, 2, 0.025),
        new THREE.MeshStandardMaterial({ color: owner.color, roughness: 0.4 }),
      );
      station.position.y = 0.17;
      station.castShadow = true;
      group.add(station);
      const roof = mesh('cone', [0.32, 0.2, 0.25], '#394642', [0, 0.39, 0], group);
      roof.rotation.y = Math.PI / 4;
      box([0.095, 0.135, 0.015], '#eee4cc', [0, 0.125, 0.155], group);
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.userData.interaction = { kind: 'station', id: city.id };
        object.userData.enabled = true;
        eng.pickables.push(object);
      });
    }
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
