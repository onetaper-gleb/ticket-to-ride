import * as THREE from 'three';
import type { MenuSurfaceMaps } from './menu-model-utils';

export type MenuCompositionArt = {
  clockFace: THREE.Texture;
  luggageStickers: THREE.Texture;
  wood: THREE.Texture;
  ticketPrint: THREE.Texture;
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
    ].map((name) => loadTexture(base + name, signal)),
  );
  const textures = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const failure = results.find((r) => r.status === 'rejected');
  if (failure?.status === 'rejected') {
    textures.forEach((texture) => texture.dispose());
    throw failure.reason;
  }
  const [clockFace, luggageStickers, wood, ticketPrint, plaster, paint, leather, stone, paper] =
    textures;
  // The large floor has per-face 0..1 UV; finer repetition keeps stone grain in scale.
  stone.repeat.set(8, 8);
  // The 2:1 print uses a single quarter turn on the portrait paper; the grip stays fixed.
  ticketPrint.center.set(0.5, 0.5);
  ticketPrint.rotation = Math.PI / 2;
  let disposed = false;
  return {
    clockFace,
    luggageStickers,
    wood,
    ticketPrint,
    surfaces: {
      cream: plaster,
      green: paint,
      boardPaint: paint,
      wood,
      woodDark: wood,
      leather,
      stone,
      paper,
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      textures.forEach((texture) => texture.dispose());
    },
  };
}
