import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { buildMenuModels, type MenuModels } from './menu-models';
import { buildMenuCashier, type MenuCashier } from './menu-character';
import { preloadMenuHandSurfaces } from './menu-character-hands';
import {
  loadMenuCompositionArt,
  loadMenuTitleShapes,
  type MenuCompositionArt,
  type MenuTitleShapes,
} from './menu-composition-art';
import { menuCompositionPreset, type MenuRect } from './menu-composition-presets';

let areaLightsReady = false;

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
  lighting: {
    sky: THREE.HemisphereLight;
    softFill: THREE.RectAreaLight;
    canopyFill: THREE.RectAreaLight;
    railFill: THREE.SpotLight;
    lamps: readonly THREE.SpotLight[];
  };
  readonly titleVisible: boolean;
  /** Title rect is measured in untransformed native board pixels, including its border. */
  layout(
    width: number,
    height: number,
    board?: MenuRect,
    settings?: MenuRect,
    title?: MenuRect,
  ): void;
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
  let title: MenuTitleShapes | undefined;
  try {
    await preloadMenuHandSurfaces(`${prefix}models/cashier/hand-bind-v1.bin`, options.signal);
    try {
      title = await loadMenuTitleShapes(`${prefix}art/`, options.signal);
    } catch {
      options.signal?.throwIfAborted();
    }
    options.signal?.throwIfAborted();
    models = buildMenuModels({
      ...art,
      materialOverrides: {
        woodDark: { color: '#887660' },
        leather: { roughness: 0.9 },
        cream: { color: '#c6cbd1', roughness: 0.95 },
        stone: { color: '#c0b9ae', roughness: 0.92 },
        // The mapped green already contains its base color; grade its channels in linear space.
        green: { color: new THREE.Color(1.4, 1.05, 1.8) },
        boardPaint: { color: '#abb8b0', roughness: 0.88 },
        paper: { color: '#d8d2bc', roughness: 0.95 },
        iron: { color: '#3d454a', roughness: 0.6, metalness: 0.25 },
        steel: { color: '#3d454a', roughness: 0.6, metalness: 0.45 },
        sky: { color: '#000000', emissive: '#ffffff', emissiveIntensity: 1 },
      },
    });
    // The existing sky surface owns this clone; use it for unlit sky emission too.
    const sky = models.surfaces.get('sky');
    if (!sky?.map) throw new Error('Menu environment is missing the sky surface map');
    sky.map.wrapS = sky.map.wrapT = THREE.ClampToEdgeWrapping;
    sky.emissiveMap = sky.map;
    sky.needsUpdate = true;
    models.parts.stationRoot.rotation.y = menuCompositionPreset(1672, 941).buildingYaw;
    models.parts.outerCanopySupport.position.set(1.7, 0, -0.2);
    models.parts.backdropRoot.position.x = 2;
    models.parts.luggage[0].position.set(-2.4, -0.9, 2.1);
    models.root.updateMatrixWorld(true);
    const anchor = models.cashierAnchor;
    const rightContact = models.counter.handRestRight;
    if (!rightContact.parent) throw new Error('Menu right-hand contact has no parent');
    const rightWorld = anchor.localToWorld(new THREE.Vector3(0.1, 0, 0.15));
    rightContact.position.copy(rightContact.parent.worldToLocal(rightWorld));
    models.root.updateMatrixWorld(true);
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
    models.clock.root.position.set(2.114, 1.55, -0.03);
    models.clock.hourHand.rotation.z = (Math.PI * (10 + 10 / 60)) / -6;
    models.clock.minuteHand.rotation.z = -Math.PI / 3;
    return assemble(models, cashier, art, title);
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
  titleShapes?: MenuTitleShapes,
): MenuComposition {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a4c5e7');
  scene.add(models.root);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  const fill = new THREE.HemisphereLight('#bed0e2', '#918675', 1.1);
  const keyLight = new THREE.DirectionalLight('#fff2df', 2);
  keyLight.position.set(6, 7, -3);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  Object.assign(keyLight.shadow.camera, {
    left: -5.5,
    right: 6,
    top: 4.5,
    bottom: -4,
    near: 0.1,
    far: 25,
  });
  keyLight.shadow.normalBias = 0.004;
  keyLight.shadow.bias = -0.00015;
  keyLight.shadow.radius = 8;
  keyLight.shadow.intensity = 0.8;
  // Three.js owns the shared LTC lookup tables; each renderer owns their GPU upload.
  if (!areaLightsReady) {
    RectAreaLightUniformsLib.init();
    areaLightsReady = true;
  }
  const softFill = new THREE.RectAreaLight('#fff1dd', 6, 5, 4);
  softFill.position.set(2, 3, 4);
  softFill.lookAt(0, 0.5, 0);
  // Reflected platform daylight reaches the roof underside from below.
  const canopyFill = new THREE.RectAreaLight('#dedbd0', 3, 4, 2);
  canopyFill.name = 'canopy-bounce-fill';
  canopyFill.position.set(4.2, -1.4, 1.1);
  canopyFill.lookAt(4.2, 0, -1);
  models.parts.canopy.add(canopyFill);
  const railFill = new THREE.SpotLight('#ffe2b1', 200, 12, 0.3, 0.9, 2);
  railFill.position.set(4, 1.7, 1.4);
  scene.add(fill, keyLight, softFill, railFill, railFill.target);
  const lampLights = models.parts.lamps.map((fixture) => {
    const windowLamp = fixture.name === 'lamp-window';
    const distantLamp = fixture.name === 'lamp-distant';
    const light = new THREE.SpotLight(
      '#ffcf83',
      windowLamp ? 4 : distantLamp ? 4 : 2,
      windowLamp ? 3 : distantLamp ? 3.5 : 5,
      windowLamp ? 1.1 : distantLamp ? 0.8 : 0.9,
      windowLamp ? 1 : 0.75,
      2,
    );
    light.name = `${fixture.name}-light`;
    light.position.set(0, -fixture.userData.contact.height - 0.02, 0.015);
    const target = new THREE.Object3D();
    target.name = `${fixture.name}-light-target`;
    target.position.set(
      0,
      light.position.y - (windowLamp ? 1 : 1.5),
      windowLamp ? -0.25 : distantLamp ? -0.2 : -0.5,
    );
    fixture.add(light, target);
    light.target = target;
    light.castShadow = windowLamp;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.normalBias = 0.002;
    light.shadow.bias = -0.0001;
    light.shadow.radius = 2;
    return light;
  });
  let disposed = false;
  const luggageOrigins = models.parts.luggage.map((item) => item.position.clone());
  function alive() {
    if (disposed) throw new Error('Menu composition is disposed');
  }
  function layout(
    width: number,
    height: number,
    board?: MenuRect,
    settings?: MenuRect,
    title?: MenuRect,
  ) {
    alive();
    const preset = menuCompositionPreset(width, height);
    camera.aspect = width / height;
    camera.fov = preset.fov;
    camera.position.set(...preset.camera);
    camera.lookAt(camera.position.x, camera.position.y, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const station = models.parts.stationRoot;
    station.rotation.y = preset.buildingYaw;
    models.root.updateMatrixWorld(true);
    models.parts.luggage.forEach((item, index) => {
      if (index < 3) item.position.copy(luggageOrigins[index]).z += preset.luggageAdvance;
    });
    models.railwayRoot.position.copy(
      models.root.worldToLocal(new THREE.Vector3(...preset.railway)),
    );
    models.railwayRoot.quaternion.copy(
      models.root.getWorldQuaternion(new THREE.Quaternion()).invert(),
    );
    models.clock.root.position.set(
      preset.kind === 'narrow' ? 0.98 : preset.kind === 'compact' ? 1.4 : 2.114,
      1.55,
      -0.03,
    );
    const z = 0.04;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z).applyMatrix4(station.matrixWorld);
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
      return station.worldToLocal(hit);
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
    if (titleShapes && title) {
      const size = models.board.bounds.getSize(new THREE.Vector3());
      const titleBounds = new THREE.Box2(
        new THREE.Vector2(
          (title.x / boardRect.width - 0.5) * size.x,
          (0.5 - (title.y + title.height) / boardRect.height) * size.y,
        ),
        new THREE.Vector2(
          ((title.x + title.width) / boardRect.width - 0.5) * size.x,
          (0.5 - title.y / boardRect.height) * size.y,
        ),
      );
      try {
        models.board.setTitleShapes(titleShapes.shapes, titleShapes.sourceBounds, titleBounds);
      } catch {
        models.board.clearTitleShapes();
      }
    } else {
      models.board.clearTitleShapes();
    }
    scene.updateMatrixWorld(true);
    railFill.target.position.copy(models.train.root.localToWorld(new THREE.Vector3(0, 0.95, 0.55)));
    railFill.target.updateMatrixWorld(true);
  }
  function projectCorners(width: number, height: number) {
    alive();
    const quad = (corners: readonly THREE.Vector3[]): MenuQuad => {
      return corners.map((corner) => {
        const p = corner.project(camera);
        return { x: ((p.x + 1) * width) / 2, y: ((1 - p.y) * height) / 2 };
      }) as unknown as MenuQuad;
    };
    const corners = models.board.getCorners();
    return {
      board: quad(corners.board),
      settings: quad(corners.settings),
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
    lighting: { sky: fill, softFill, canopyFill, railFill, lamps: lampLights },
    get titleVisible() {
      return !disposed && models.board.titleRoot.visible;
    },
    layout,
    projectFrame,
    projectCorners,
    dispose() {
      if (disposed) return;
      disposed = true;
      canopyFill.removeFromParent();
      cashier.dispose();
      railFill.shadow.dispose();
      railFill.removeFromParent();
      railFill.target.removeFromParent();
      for (const light of lampLights) {
        light.shadow.dispose();
        light.removeFromParent();
        light.target.removeFromParent();
      }
      models.dispose();
      models.root.removeFromParent();
      scene.background = null;
      art.dispose();
      keyLight.shadow.dispose();
      scene.clear();
    },
  };
}
