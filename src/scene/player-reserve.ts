import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Observation } from '../shared/types';
import { createRailMiniatures } from './rail-miniatures';
import { batchRailMiniatures } from './rail-batching';

/** Public stock only. Decorative meshes are never registered as table controls or pickables. */
export function buildPlayerReserve(parent: THREE.Group, observation: Observation): void {
  const reserve = new THREE.Group();
  reserve.name = 'Your enamel railway stock';
  reserve.position.set(0, -1.45, 11.5);
  parent.add(reserve);

  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometries = new Map<string, THREE.BufferGeometry>();
  const material = (color: string, metal = false) => {
    const key = `${color}:${metal}`;
    let surface = materials.get(key);
    if (!surface) {
      surface = new THREE.MeshStandardMaterial({
        color,
        roughness: metal ? 0.44 : 0.68,
        metalness: metal ? 0.35 : 0,
      });
      materials.set(key, surface);
    }
    return surface;
  };
  const box = (
    width: number,
    height: number,
    depth: number,
    color: string,
    x: number,
    y: number,
    z: number,
    metal = false,
  ) => {
    const key = `${width}:${height}:${depth}`;
    let geometry = geometries.get(key);
    if (!geometry) {
      geometry = new RoundedBoxGeometry(width, height, depth, 1, Math.min(0.028, height / 4));
      geometries.set(key, geometry);
    }
    const mesh = new THREE.Mesh(geometry, material(color, metal));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    reserve.add(mesh);
    return mesh;
  };

  // The board ends at Z=8.25. This tray starts at Z=9.7, leaving a clear wooden margin.
  box(8.8, 0.14, 3.6, '#69523a', 0, 0.07, 0);
  box(8.49, 0.025, 3.29, '#425645', 0, 0.15, 0);
  for (const side of [-1, 1]) {
    box(8.8, 0.22, 0.14, '#806447', 0, 0.27, side * 1.73);
    box(0.14, 0.22, 3.46, '#806447', side * 4.33, 0.27, 0);
    box(8.55, 0.012, 0.025, '#b8a174', 0, 0.385, side * 1.71, true);
  }

  const trains = Math.max(0, Math.min(45, observation.self.trainsRemaining));
  const models = createRailMiniatures();
  const groups: THREE.Group[] = [];
  for (let index = 0; index < trains; index++) {
    const coach = models.addCoach(reserve, observation.self.color, 0.78, 0.28);
    coach.position.set(((index % 9) - 4) * 0.89, 0.171, (Math.floor(index / 9) - 2) * 0.5);
    coach.rotation.y = Math.PI / 2;
    // The batching helper preserves interactions for game pieces. These are decorative stock.
    coach.userData.interaction = { kind: 'control', id: 'decorative-reserve' };
    groups.push(coach);
  }
  if (groups.length) {
    const { meshes } = batchRailMiniatures(reserve, groups);
    for (const mesh of meshes) {
      delete mesh.userData.instanceInteractions;
      mesh.userData.enabled = false;
      mesh.name = 'Decorative coach reserve';
    }
  }
  addLabel(reserve, `ВАШИ ВАГОНЫ   ·   ${trains} / 45`, 7.75, 0.35, 0, 0.395, 1.48);

  const stations = Math.max(0, Math.min(3, observation.self.stationsRemaining));
  box(1.36, 0.14, 3.6, '#69523a', 5.25, 0.07, 0);
  box(1.1, 0.025, 3.32, '#425645', 5.25, 0.15, 0);
  for (const side of [-1, 1]) {
    box(1.36, 0.2, 0.12, '#806447', 5.25, 0.26, side * 1.74);
    box(0.12, 0.2, 3.36, '#806447', 5.25 + side * 0.62, 0.26, 0);
  }
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.37, 0);
  roofShape.lineTo(0, 0.24);
  roofShape.lineTo(0.37, 0);
  roofShape.closePath();
  const roofGeometry = new THREE.ExtrudeGeometry(roofShape, {
    depth: 0.66,
    bevelEnabled: false,
    steps: 1,
  });
  roofGeometry.translate(0, 0, -0.33);
  for (let index = 0; index < stations; index++) {
    const z = (index - 1) * 0.86 - 0.11;
    box(0.62, 0.39, 0.56, observation.self.color, 5.25, 0.365, z);
    box(0.72, 0.035, 0.66, '#bdad7f', 5.25, 0.184, z);
    const roof = new THREE.Mesh(roofGeometry, material('#536a57'));
    roof.position.set(5.25, 0.56, z);
    roof.castShadow = true;
    reserve.add(roof);
    box(0.14, 0.25, 0.014, '#293b31', 5.25, 0.31, z + 0.287);
    for (const side of [-1, 1]) {
      box(0.1, 0.11, 0.015, '#e4d9b9', 5.25 + side * 0.2, 0.42, z + 0.29);
      box(0.012, 0.004, 0.015, '#b5a16f', 5.25 + side * 0.2, 0.42, z + 0.3, true);
    }
    box(0.09, 0.23, 0.1, '#67523c', 5.25 + 0.19, 0.76, z - 0.13);
  }
  // Avoid an unused geometry when all stations have already been built.
  if (!stations) roofGeometry.dispose();
  addLabel(reserve, `СТАНЦИИ · ${stations}`, 1.05, 0.27, 5.25, 0.38, 1.42);
}

function addLabel(
  parent: THREE.Group,
  text: string,
  width: number,
  depth: number,
  x: number,
  y: number,
  z: number,
) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((width / depth) * 128);
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#c9ba91';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#7d7055';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#334438';
    ctx.font = `500 ${width < 2 ? 51 : 84}px "IBM Plex Sans", Arial, sans-serif`;
    ctx.fillText(text, canvas.width / 2, 67, canvas.width - 36);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }),
  );
  plaque.rotation.x = -Math.PI / 2;
  plaque.position.set(x, y, z);
  parent.add(plaque);
}
