import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { MenuSurfaceMaps } from './menu-model-utils';

export type MenuTitleShapes = {
  shapes: readonly THREE.Shape[];
  sourceBounds: THREE.Box2;
};

export async function loadMenuTitleShapes(
  baseUrl = '/menu/art/',
  signal?: AbortSignal,
): Promise<MenuTitleShapes> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const response = await fetch(`${base}sources/europe-shape-source.svg`, { signal });
  if (!response.ok) throw new Error(`Menu title HTTP ${response.status}`);
  const source = await response.text();
  signal?.throwIfAborted();
  const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
  const viewBox = xml.documentElement
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    !viewBox ||
    viewBox.length !== 4 ||
    !viewBox.every(Number.isFinite) ||
    viewBox[2] <= 0 ||
    viewBox[3] <= 0
  )
    throw new Error('Menu title requires a finite positive SVG viewBox');
  const parsed = new SVGLoader().parse(source);
  const shapes = parsed.paths.flatMap((path) => SVGLoader.createShapes(path));
  if (!shapes.length) throw new Error('Menu title SVG contains no shapes');
  const [x, y, width, height] = viewBox;
  const sourceBounds = new THREE.Box2(
    new THREE.Vector2(x, y),
    new THREE.Vector2(x + width, y + height),
  );
  if (!sourceBounds.max.toArray().every(Number.isFinite))
    throw new Error('Menu title SVG viewBox overflows');
  return { shapes, sourceBounds };
}

export type MenuCompositionArt = {
  clockFace: THREE.Texture;
  luggageStickers: THREE.Texture;
  wood: THREE.Texture;
  ticketPrint: THREE.Texture;
  distantSky: THREE.Texture;
  surfaces: MenuSurfaceMaps;
  dispose(): void;
};

async function loadTexture(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Menu art HTTP ${response.status}: ${url}`);
  const blobUrl = URL.createObjectURL(await response.blob());
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => finish(new DOMException('Menu art loading cancelled', 'AbortError'));
      const finish = (error?: Error) => {
        signal?.removeEventListener('abort', abort);
        image.onload = image.onerror = null;
        if (error) reject(error);
        else resolve();
      };
      image.onload = () => finish();
      image.onerror = () => finish(new Error(`Cannot decode menu art: ${url}`));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        finish(new DOMException('Menu art loading cancelled', 'AbortError'));
        return;
      }
      image.src = blobUrl;
    });
    signal?.throwIfAborted();
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  } finally {
    URL.revokeObjectURL(blobUrl);
    image.onload = image.onerror = null;
  }
}

export async function loadMenuCompositionArt(
  baseUrl = '/menu/art/',
  signal?: AbortSignal,
): Promise<MenuCompositionArt> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const results = await Promise.allSettled(
    [
      'clock-face.svg',
      'luggage-stickers.svg',
      'wood-tile.webp',
      'ticket-print.svg',
      'plaster-tile.webp',
      'board-paint.webp',
      'leather-tile.webp',
      'stone-tile.webp',
      'paper-tile.webp',
      'distant-sky.svg',
    ].map((name) => loadTexture(base + name, signal)),
  );
  const textures = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const failure = results.find((r) => r.status === 'rejected');
  if (failure?.status === 'rejected') {
    textures.forEach((texture) => texture.dispose());
    throw failure.reason;
  }
  const [
    clockFace,
    luggageStickers,
    wood,
    ticketPrint,
    plaster,
    paint,
    leather,
    stone,
    paper,
    distantSky,
  ] = textures;
  // The large floor has per-face 0..1 UV; finer repetition keeps stone grain in scale.
  stone.repeat.set(8, 8);
  // The large sky box exposes its middle UV band below the canopy.
  distantSky.repeat.set(1, 0.7);
  distantSky.offset.set(0, 0.4);
  // The 2:1 print uses a single quarter turn on the portrait paper; the grip stays fixed.
  ticketPrint.center.set(0.5, 0.5);
  ticketPrint.rotation = Math.PI / 2;
  let disposed = false;
  return {
    clockFace,
    luggageStickers,
    wood,
    ticketPrint,
    distantSky,
    surfaces: {
      cream: plaster,
      green: paint,
      boardPaint: paint,
      wood,
      woodDark: wood,
      leather,
      stone,
      paper,
      sky: distantSky,
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      textures.forEach((texture) => texture.dispose());
    },
  };
}
