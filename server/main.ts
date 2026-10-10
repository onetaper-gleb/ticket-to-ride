import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRoomServer } from './transport';

function numeric(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new Error('Invalid server configuration');
  return value;
}

try {
  const server = await createRoomServer({
    host: process.env.EUROPE_HOST ?? '127.0.0.1',
    port: numeric('EUROPE_PORT', 8787, 1, 65535),
    dbPath:
      process.env.EUROPE_DB_PATH ??
      resolve(dirname(fileURLToPath(import.meta.url)), 'data', 'rooms.sqlite'),
    allowedOrigins: process.env.EUROPE_ALLOWED_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    botDelayMs: numeric('EUROPE_BOT_DELAY_MS', 180, 1, 60_000),
  });
  console.info(`Europe private server: ${server.url}`);
  const shutdown = () => {
    void server.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch {
  console.error(
    'Europe server could not start. Check configuration, database access and port availability.',
  );
  process.exitCode = 1;
}
