import { createSocket, type RemoteInfo } from 'node:dgram';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Own localhost QA implementation of the UDP Binding subset in RFC 8489 §§5,14.2,14.7.
// https://www.rfc-editor.org/rfc/rfc8489.html
// IPv4 only; credentials, TCP and TURN relay are outside this diagnostic helper.
const COOKIE = 0x2112a442;
const FINGERPRINT = 0x8028;

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validBinding(data: Buffer): boolean {
  if (data.length < 20 || data.readUInt16BE(0) !== 0x0001 || data.readUInt32BE(4) !== COOKIE)
    return false;
  const length = data.readUInt16BE(2);
  if (length % 4 !== 0 || data.length !== 20 + length) return false;
  let offset = 20;
  while (offset < data.length) {
    if (offset + 4 > data.length) return false;
    const type = data.readUInt16BE(offset),
      size = data.readUInt16BE(offset + 2);
    const next = offset + 4 + Math.ceil(size / 4) * 4;
    if (next > data.length) return false;
    // Required/auth attributes are unsupported by this limited, unauthenticated QA endpoint.
    if (type < 0x8000) return false;
    if (
      type === FINGERPRINT &&
      (size !== 4 ||
        next !== data.length ||
        data.readUInt32BE(offset + 4) !== (crc32(data.subarray(0, offset)) ^ 0x5354554e) >>> 0)
    )
      return false;
    // RFC 8489 receivers ignore the actual padding octets; only padded bounds matter.
    offset = next;
  }
  return offset === data.length;
}

function bindingSuccess(request: Buffer, remote: RemoteInfo): Buffer | null {
  const address = remote.address.split('.').map(Number);
  if (
    remote.family !== 'IPv4' ||
    address.length !== 4 ||
    address[0] !== 127 ||
    !address.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
  )
    return null;
  const response = Buffer.alloc(40);
  response.writeUInt16BE(0x0101, 0);
  response.writeUInt16BE(20, 2);
  response.writeUInt32BE(COOKIE, 4);
  request.copy(response, 8, 8, 20);
  response.writeUInt16BE(0x0020, 20);
  response.writeUInt16BE(8, 22);
  response[25] = 1;
  response.writeUInt16BE(remote.port ^ (COOKIE >>> 16), 26);
  for (let i = 0; i < 4; i++) response[28 + i] = address[i]! ^ response[4 + i]!;
  response.writeUInt16BE(FINGERPRINT, 32);
  response.writeUInt16BE(4, 34);
  response.writeUInt32BE((crc32(response.subarray(0, 32)) ^ 0x5354554e) >>> 0, 36);
  return response;
}

export async function createLocalStun(options: { port?: number } = {}) {
  const port = options.port ?? 3478;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Invalid local STUN port');
  const socket = createSocket('udp4');
  let requests = 0,
    responses = 0,
    errors = 0,
    closed = false;
  socket.on('error', () => {
    errors++;
  });
  socket.on('message', (data, remote) => {
    if (closed) return;
    if (!validBinding(data)) {
      errors++;
      return;
    }
    const response = bindingSuccess(data, remote);
    if (!response) {
      errors++;
      return;
    }
    requests++;
    socket.send(response, remote.port, remote.address, (error) => {
      if (error) errors++;
      else responses++;
    });
  });
  try {
    await new Promise<void>((ready, reject) => {
      socket.once('error', reject);
      socket.bind(port, '127.0.0.1', () => {
        socket.off('error', reject);
        ready();
      });
    });
  } catch (error) {
    try {
      socket.close();
    } catch {
      /* Startup did not bind. */
    }
    throw error;
  }
  const actualPort = socket.address().port;
  let closing: Promise<void> | null = null;
  return {
    port: actualPort,
    count: () => ({ requests, responses, errors }),
    close: () =>
      (closing ??= new Promise<void>((ready) => {
        closed = true;
        socket.close(() => ready());
      })),
  };
}

async function probeLocalStun() {
  if (crc32(Buffer.from('123456789')) !== 0xcbf43926) throw new Error('CRC32 probe failed');
  const server = await createLocalStun({ port: 0 }),
    client = createSocket('udp4');
  const transaction = randomBytes(12),
    request = Buffer.alloc(28);
  request.writeUInt16BE(1, 0);
  request.writeUInt16BE(8, 2);
  request.writeUInt32BE(COOKIE, 4);
  transaction.copy(request, 8);
  request.writeUInt16BE(FINGERPRINT, 20);
  request.writeUInt16BE(4, 22);
  request.writeUInt32BE((crc32(request.subarray(0, 20)) ^ 0x5354554e) >>> 0, 24);
  try {
    await new Promise<void>((ready) => client.bind(0, '127.0.0.1', ready));
    const reply = await new Promise<Buffer>((ready, reject) => {
      const timer = setTimeout(() => reject(new Error('Local STUN probe timeout')), 1500);
      client.once('message', (data) => {
        clearTimeout(timer);
        ready(data);
      });
      client.send(request, server.port, '127.0.0.1', (error) => {
        if (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
    });
    const ownPort = client.address().port;
    if (
      reply.length !== 40 ||
      reply.readUInt16BE(0) !== 0x0101 ||
      reply.readUInt16BE(2) !== 20 ||
      reply.readUInt32BE(4) !== COOKIE ||
      !reply.subarray(8, 20).equals(transaction) ||
      reply.readUInt16BE(20) !== 0x0020 ||
      reply.readUInt16BE(22) !== 8 ||
      reply[24] !== 0 ||
      reply[25] !== 1 ||
      (reply.readUInt16BE(26) ^ (COOKIE >>> 16)) !== ownPort ||
      (reply.readUInt32BE(28) ^ COOKIE) >>> 0 !== 0x7f000001 ||
      reply.readUInt16BE(32) !== FINGERPRINT ||
      reply.readUInt32BE(36) !== (crc32(reply.subarray(0, 32)) ^ 0x5354554e) >>> 0
    )
      throw new Error('Invalid local STUN response');
    return server.count();
  } finally {
    client.close();
    await server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.includes('--probe')) {
      console.info(JSON.stringify({ ok: true, ...(await probeLocalStun()) }));
    } else {
      const server = await createLocalStun({ port: Number(process.env.EUROPE_STUN_PORT ?? 3478) });
      console.info('Local STUN QA responder ready.');
      const close = () => {
        void server.close().then(() => {
          console.info(JSON.stringify(server.count()));
          process.exit(0);
        });
      };
      process.once('SIGINT', close);
      process.once('SIGTERM', close);
    }
  } catch {
    console.error('Local STUN QA helper failed.');
    process.exitCode = 1;
  }
}
