import * as THREE from 'three';
import { buildMenuModels, type MenuModels } from './menu-models';
import { buildMenuCashier, type MenuCashier } from './menu-character';
import { preloadMenuHandSurfaces } from './menu-character-hands';
import { loadMenuCompositionArt, type MenuCompositionArt } from './menu-composition-art';
import { menuCompositionPreset, type MenuRect } from './menu-composition-presets';

export type MenuScreenPoint = { x: number; y: number };
/** Clockwise, starting at the top left of the physical front face. */
export type MenuQuad = readonly [
  MenuScreenPoint,
  MenuScreenPoint,
  MenuScreenPoint,
  MenuScreenPoint,
];

/** Maps the entire native DOM border box onto the projected physical face. */
export function menuQuadCssMatrix(quad: MenuQuad, width: number, height: number): string {
  if (![width, height].every((v) => Number.isFinite(v) && v > 0))
    throw new Error('Menu DOM dimensions must be positive and finite');
  const [tl, tr, br, bl] = quad;
  const dx1 = tr.x - br.x,
    dx2 = bl.x - br.x;
  const dy1 = tr.y - br.y,
    dy2 = bl.y - br.y;
  const dx3 = tl.x - tr.x + br.x - bl.x,
    dy3 = tl.y - tr.y + br.y - bl.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < 1e-8) throw new Error('Menu projected face is degenerate');
  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  const a = (tr.x - tl.x + g * tr.x) / width;
  const b = (bl.x - tl.x + h * bl.x) / height;
  const d = (tr.y - tl.y + g * tr.y) / width;
  const e = (bl.y - tl.y + h * bl.y) / height;
  return `matrix3d(${[a, d, 0, g / width, b, e, 0, h / height, 0, 0, 1, 0, tl.x, tl.y, 0, 1].join(',')})`;
}

export type MenuComposition = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  models: MenuModels;
  cashier: MenuCashier;
  art: MenuCompositionArt;
  keyLight: THREE.DirectionalLight;
  layout(width: number, height: number, board?: MenuRect, settings?: MenuRect): void;
  projectFrame(width: number, height: number): { board: MenuRect; settings: MenuRect };
  projectCorners(width: number, height: number): { board: MenuQuad; settings: MenuQuad };
  dispose(): void;
};

export async function createMenuComposition(
  options: { assetBase?: string; signal?: AbortSignal } = {},
): Promise<MenuComposition> {
  const base = options.assetBase ?? '/menu/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const art = await loadMenuCompositionArt(`${prefix}art/`, options.signal);
  let models: MenuModels | undefined;
  let cashier: MenuCashier | undefined;
  try {
    await preloadMenuHandSurfaces(`${prefix}models/cashier/hand-bind-v1.bin`, options.signal);
    options.signal?.throwIfAborted();
    models = buildMenuModels(art);
    models.root.rotation.y = menuCompositionPreset(1672, 941).buildingYaw;
    models.root.updateMatrixWorld(true);
    const anchor = models.cashierAnchor;
    cashier = buildMenuCashier({
      handRestLeft: anchor.worldToLocal(
        models.counter.handRestLeft.getWorldPosition(new THREE.Vector3()),
      ),
      handRestRight: anchor.worldToLocal(
        models.counter.handRestRight.getWorldPosition(new THREE.Vector3()),
      ),
    });
    anchor.add(cashier.root);
    const slot = models.root.getObjectByName('ticket-slot');
    if (!slot) throw new Error('Menu environment is missing ticket-slot');
    slot.add(cashier.ticketsForHolder);
    cashier.ticketsForHolder.position.set(0, 0.005, 0);
    cashier.ticketsForHolder.quaternion.identity();
    cashier.ticketsForHolder.scale.setScalar(1);
    cashier.ticket.material.map = art.ticketPrint;
    cashier.ticket.material.color.set('#ffffff');
    cashier.ticket.material.needsUpdate = true;
    models.clock.root.position.set(1.7, 1.45, -0.03);
    models.clock.hourHand.rotation.z = (Math.PI * (10 + 10 / 60)) / -6;
    models.clock.minuteHand.rotation.z = -Math.PI / 3;
    return assemble(models, cashier, art);
  } catch (error) {
    cashier?.dispose();
    models?.dispose();
    art.dispose();
    throw error;
  }
}

function assemble(
  models: MenuModels,
  cashier: MenuCashier,
  art: MenuCompositionArt,
): MenuComposition {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#abcbd7');
  scene.add(models.root);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  const fill = new THREE.HemisphereLight('#fff7e7', '#738381', 2.6);
  const keyLight = new THREE.DirectionalLight('#fff0d7', 3.0);
  keyLight.position.set(-3, 6, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6 });
  keyLight.shadow.normalBias = 0.025;
  scene.add(fill, keyLight);
  let disposed = false;
  function alive() {
    if (disposed) throw new Error('Menu composition is disposed');
  }
  function layout(width: number, height: number, board?: MenuRect, settings?: MenuRect) {
    alive();
    const preset = menuCompositionPreset(width, height);
    camera.aspect = width / height;
    camera.fov = preset.fov;
    camera.position.set(...preset.camera);
    camera.lookAt(camera.position.x, camera.position.y, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    models.root.rotation.y = preset.buildingYaw;
    models.root.updateMatrixWorld(true);
    models.railwayRoot.position.copy(
      models.root.worldToLocal(new THREE.Vector3(...preset.railway)),
    );
    models.railwayRoot.quaternion.copy(
      models.root.getWorldQuaternion(new THREE.Quaternion()).invert(),
    );
    models.clock.root.position.set(
      preset.kind === 'narrow' ? 0.98 : preset.kind === 'compact' ? 1.4 : 1.7,
      1.45,
      -0.03,
    );
    const z = 0.04;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 0, 1).applyQuaternion(
        models.root.getWorldQuaternion(new THREE.Quaternion()),
      ),
      models.root.localToWorld(new THREE.Vector3(0, 0, z)),
    );
    const point = (x: number, y: number) => {
      const direction = new THREE.Vector3((2 * x) / width - 1, 1 - (2 * y) / height, 0.5)
        .unproject(camera)
        .sub(camera.position)
        .normalize();
      const hit = new THREE.Ray(camera.position, direction).intersectPlane(
        plane,
        new THREE.Vector3(),
      );
      if (!hit) throw new Error('Menu frame is outside the camera-facing plane');
      return models.root.worldToLocal(hit);
    };
    const box = (rect: MenuRect) => {
      if (
        ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
        rect.width <= 24 ||
        rect.height <= 24
      )
        throw new Error('Menu frames require finite rects larger than their borders');
      const tl = point(rect.x, rect.y),
        bl = point(rect.x, rect.y + rect.height);
      const right = point(rect.x + rect.width, rect.y);
      return new THREE.Box3(new THREE.Vector3(tl.x, bl.y, z), new THREE.Vector3(right.x, tl.y, z));
    };
    const boardRect = board ?? preset.board,
      settingsRect = settings ?? preset.settings;
    const boardBounds = box(boardRect),
      settingsBounds = box(settingsRect);
    models.board.setLayout(
      boardBounds,
      settingsBounds,
      (12 * (boardBounds.max.y - boardBounds.min.y)) / boardRect.height,
      (6 * (settingsBounds.max.y - settingsBounds.min.y)) / settingsRect.height,
    );
    scene.updateMatrixWorld(true);
  }
  function projectCorners(width: number, height: number) {
    alive();
    const quad = (root: THREE.Group, name: string): MenuQuad => {
      const face = root.getObjectByName(name) as THREE.Mesh | undefined;
      if (!face?.isMesh) throw new Error(`Menu environment is missing physical face ${name}`);
      face.geometry.computeBoundingBox();
      const b = face.geometry.boundingBox!;
      return [
        [b.min.x, b.max.y],
        [b.max.x, b.max.y],
        [b.max.x, b.min.y],
        [b.min.x, b.min.y],
      ].map(([x, y]) => {
        const p = new THREE.Vector3(x, y, b.max.z).applyMatrix4(face.matrixWorld).project(camera);
        return { x: ((p.x + 1) * width) / 2, y: ((1 - p.y) * height) / 2 };
      }) as unknown as MenuQuad;
    };
    return {
      board: quad(models.board.root, 'board-frame/green'),
      settings: quad(models.board.settingsRoot, 'settings-frame/wood'),
    };
  }
  function projectFrame(width: number, height: number) {
    alive();
    const rect = (quad: MenuQuad) => {
      const xs = quad.map((p) => p.x),
        ys = quad.map((p) => p.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    };
    const corners = projectCorners(width, height);
    return { board: rect(corners.board), settings: rect(corners.settings) };
  }
  return {
    scene,
    camera,
    models,
    cashier,
    art,
    keyLight,
    layout,
    projectFrame,
    projectCorners,
    dispose() {
      if (disposed) return;
      disposed = true;
      cashier.dispose();
      models.dispose();
      models.root.removeFromParent();
      art.dispose();
      keyLight.shadow.dispose();
      scene.clear();
    },
  };
}
