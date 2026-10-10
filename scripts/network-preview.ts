import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const project = fileURLToPath(new URL('../', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'europe-network-preview-'));
await writeFile(
  join(root, 'index.html'),
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Europe — локальная сетевая проверка</title></head><body><div id="root"></div><script type="module" src="/@fs/${project}src/network/preview.tsx"></script></body></html>`,
);
const server = await createServer({
  configFile: false,
  root,
  publicDir: join(project, 'public'),
  esbuild: { jsx: 'automatic' },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.NETWORK_PREVIEW_PORT ?? 5177),
    strictPort: true,
    fs: { allow: [root, project] },
  },
});
await server.listen();
server.printUrls();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  await rm(root, { recursive: true, force: true });
  process.exit(0);
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
