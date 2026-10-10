import * as THREE from 'three';
import { buildMenuModels, type MenuModels } from './menu-models';
import { buildMenuCashier, type MenuCashier } from './menu-character';
import { preloadMenuHandSurfaces } from './menu-character-hands';
import { loadMenuCompositionArt, type MenuCompositionArt } from './menu-composition-art';
import { menuCompositionPreset, type MenuRect } from './menu-composition-presets';

export type MenuComposition = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  models: MenuModels;
  cashier: MenuCashier;
  art: MenuCompositionArt;
  keyLight: THREE.DirectionalLight;
  layout(width: number, height: number, board?: MenuRect, settings?: MenuRect): void;
  projectFrame(width: number, height: number): { board: MenuRect; settings: MenuRect };
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
    models.railwayRoot.position.set(...preset.railway);
    const z = camera.position.z * 0.12;
    const point = (x: number, y: number) => {
      const ray = new THREE.Vector3((2 * x) / width - 1, 1 - (2 * y) / height, 0.5)
        .unproject(camera)
        .sub(camera.position);
      return camera.position.clone().addScaledVector(ray, (z - camera.position.z) / ray.z);
    };
    const box = (rect: MenuRect) => {
      if (
        ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
        rect.width <= 24 ||
        rect.height <= 24
      )
        throw new Error('Menu frames require finite rects larger than their borders');
      return new THREE.Box3().setFromPoints([
        point(rect.x, rect.y),
        point(rect.x + rect.width, rect.y + rect.height),
      ]);
    };
    const unitsPerPixel =
      (2 * (camera.position.z - z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / height;
    models.board.setLayout(
      box(board ?? preset.board),
      box(settings ?? preset.settings),
      12 * unitsPerPixel,
      6 * unitsPerPixel,
    );
    scene.updateMatrixWorld(true);
  }
  function projectFrame(width: number, height: number) {
    alive();
    const rect = (bounds: THREE.Box3) => {
      const a = new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z)
        .applyMatrix4(models.root.matrixWorld)
        .project(camera);
      const b = new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z)
        .applyMatrix4(models.root.matrixWorld)
        .project(camera);
      return {
        x: ((a.x + 1) * width) / 2,
        y: ((1 - a.y) * height) / 2,
        width: ((b.x - a.x) * width) / 2,
        height: ((a.y - b.y) * height) / 2,
      };
    };
    return { board: rect(models.board.bounds), settings: rect(models.board.settingsBounds) };
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
