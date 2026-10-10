import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { NETWORK_PROTOCOL } from '../src/network/protocol';
import { RoomService } from './rooms';
import { SQLiteRoomStore } from './store';
import { createTurnTimers } from './timers';

export interface RoomServerOptions {
  host?: string;
  port?: number;
  dbPath?: string;
  allowedOrigins?: readonly string[];
  botDelayMs?: number;
  turnBudgetMs?: number;
}

export async function createRoomServer(options: RoomServerOptions = {}) {
  const host = options.host ?? '127.0.0.1';
  const local = ['127.0.0.1', '::1', 'localhost'].includes(host);
  const origins = new Set(
    options.allowedOrigins ?? [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5177',
      'http://127.0.0.1:5177',
    ],
  );
  const dbPath = options.dbPath ?? ':memory:';
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const store = new SQLiteRoomStore(dbPath);
  const sockets = new Map<string, WebSocket>();
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let closing = false;
  let service: RoomService;
  const turnTimers = createTurnTimers((roomId, guard) => service.tick(roomId, guard));
  try {
    service = new RoomService(store, {
      send: (id, packet) => {
        const socket = sockets.get(id);
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(packet));
      },
      disconnect: (id) => sockets.get(id)?.close(1000, 'Session ended'),
      onSchedule: turnTimers.schedule,
      botDelayMs: options.botDelayMs,
      turnBudgetMs: options.turnBudgetMs,
    });
  } catch (error) {
    store.close();
    throw error;
  }
  const http = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ ok: true, protocol: NETWORK_PROTOCOL }));
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  const ws = new WebSocketServer({ noServer: true, maxPayload: 65_536, perMessageDeflate: false });
  http.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin;
    if (
      closing ||
      !['/', '/ws'].includes(request.url ?? '') ||
      (origin ? !origins.has(origin) : !local)
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    ws.handleUpgrade(request, socket, head, (webSocket) =>
      ws.emit('connection', webSocket, request),
    );
  });
  const alive = new WeakMap<WebSocket, boolean>();
  const disconnected = (id: string) => {
    void service.disconnected(id).catch(() => {
      if (closing) return;
      disconnectTimers.set(
        id,
        setTimeout(() => {
          disconnectTimers.delete(id);
          disconnected(id);
        }, 1000),
      );
    });
  };
  ws.on('connection', (socket) => {
    const id = randomUUID();
    sockets.set(id, socket);
    alive.set(socket, true);
    service.connect(id);
    socket.on('pong', () => alive.set(socket, true));
    socket.on('error', () => {
      /* No packet or credential is written to logs. */
    });
    socket.on('message', (data, binary) => {
      let packet: unknown;
      try {
        if (binary) throw new Error('Binary packet');
        packet = JSON.parse(data.toString());
      } catch {
        socket.send(
          JSON.stringify({
            type: 'error',
            code: 'INVALID_PACKET',
            message: 'Ожидается JSON-запрос протокола.',
          }),
        );
        return;
      }
      void service.receive(id, packet).catch(() => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(
            JSON.stringify({
              type: 'error',
              code: 'SERVER_ERROR',
              message: 'Сервер не смог сохранить действие. Повторите запрос.',
            }),
          );
      });
    });
    socket.on('close', () => {
      sockets.delete(id);
      disconnected(id);
    });
  });
  const heartbeat = setInterval(() => {
    for (const socket of sockets.values()) {
      if (!alive.get(socket)) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, 15_000);
  heartbeat.unref();
  try {
    await new Promise<void>((resolve, reject) => {
      http.once('error', reject);
      http.listen(options.port ?? 8787, host, () => {
        http.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    clearInterval(heartbeat);
    await service.close();
    ws.close();
    store.close();
    throw error;
  }
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  const url = `ws://${host.includes(':') ? `[${host}]` : host}:${address.port}`;
  let closingTask: Promise<void> | null = null;
  const close = () =>
    (closingTask ??= (async () => {
      closing = true;
      clearInterval(heartbeat);
      turnTimers.close();
      for (const timer of disconnectTimers.values()) clearTimeout(timer);
      disconnectTimers.clear();
      try {
        await service.close();
      } finally {
        for (const socket of sockets.values()) socket.terminate();
        await new Promise<void>((resolve) => ws.close(() => resolve()));
        try {
          await new Promise<void>((resolve, reject) =>
            http.close((error) => (error ? reject(error) : resolve())),
          );
        } finally {
          store.close();
        }
      }
    })());
  return { url, service, close };
}
