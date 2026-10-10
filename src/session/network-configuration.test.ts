import { describe, expect, it } from 'vitest';
import { initialSessionMode, networkConfiguration } from './network-configuration';

describe('network entry and operator configuration', () => {
  it('opens invites in the room UI without treating unrelated parameters as endpoints', () => {
    expect(initialSessionMode('?room=ABC123')).toBe('network');
    expect(initialSessionMode('?room=')).toBe('solo');
    expect(initialSessionMode('?room=%20%20')).toBe('solo');
    expect(initialSessionMode('?server=wss://unconfigured.example&test-tone=1')).toBe('solo');
  });
  it.each(['http://127.0.0.1:5175', 'http://localhost:5175', 'http://[::1]:5175'])(
    'uses the explicitly local backend for %s without external ICE services',
    (origin) => {
      expect(networkConfiguration(origin)).toEqual({
        configuration: { url: 'ws://127.0.0.1:8787/', iceServers: [] },
      });
    },
  );
  it('requires an explicit backend for a deployed frontend and WSS for HTTPS', () => {
    expect(networkConfiguration('https://game.example')).toHaveProperty('error');
    expect(networkConfiguration('https://game.example', 'ws://server.example')).toHaveProperty(
      'error',
    );
    expect(networkConfiguration('https://game.example', 'wss://server.example/rooms')).toEqual({
      configuration: { url: 'wss://server.example/rooms', iceServers: [] },
    });
  });
  it.each([
    'https://server.example',
    'ws://user:secret@server.example',
    'wss://server.example/rooms#fragment',
    'wss://server.example/rooms#',
    'not a URL',
  ])('rejects unusable or credential-bearing endpoint %s without exposing its value', (url) => {
    const result = networkConfiguration('http://localhost', url);
    expect(result.error).toBeDefined();
    expect(JSON.stringify(result)).not.toContain(url);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('passes only configured ICE fields and keeps credentials out of configuration errors', () => {
    expect(
      networkConfiguration(
        'http://localhost',
        undefined,
        JSON.stringify([
          { urls: 'stun:stun.example:3478', unrelated: 'ignored' },
          {
            urls: ['turns:relay.example:5349'],
            username: 'temporary',
            credential: 'test-credential',
          },
        ]),
      ),
    ).toEqual({
      configuration: {
        url: 'ws://127.0.0.1:8787/',
        iceServers: [
          { urls: ['stun:stun.example:3478'] },
          {
            urls: ['turns:relay.example:5349'],
            username: 'temporary',
            credential: 'test-credential',
          },
        ],
      },
    });
    for (const ice of [
      'broken secret',
      '{}',
      '[{}]',
      '[{"urls":"https://server.example"}]',
      '[{"urls":"turn:server.example","credential":42}]',
    ]) {
      const result = networkConfiguration('http://localhost', undefined, ice);
      expect(result.error).toBeDefined();
      expect(JSON.stringify(result)).not.toContain('secret');
    }
  });
});
