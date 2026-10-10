export interface NetworkConfiguration {
  url: string;
  iceServers: RTCIceServer[];
}

export type NetworkConfigurationResult =
  { configuration: NetworkConfiguration; error?: never } | { error: string; configuration?: never };

export function initialSessionMode(search: string): 'solo' | 'network' {
  return new URLSearchParams(search).get('room')?.trim() ? 'network' : 'solo';
}

export function networkConfiguration(
  origin: string,
  serverUrl?: string,
  iceConfiguration?: string,
): NetworkConfigurationResult {
  try {
    const page = new URL(origin);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname);
    const address =
      serverUrl?.trim() || (loopback && page.protocol === 'http:' ? 'ws://127.0.0.1:8787' : '');
    if (!address) return { error: 'Игра с друзьями пока недоступна: сетевой сервер не настроен.' };
    const server = new URL(address);
    if (
      !['ws:', 'wss:'].includes(server.protocol) ||
      server.username ||
      server.password ||
      server.href.includes('#')
    )
      return { error: 'Не удалось открыть сетевой режим: адрес сервера настроен неверно.' };
    if (page.protocol === 'https:' && server.protocol !== 'wss:')
      return { error: 'Для этой страницы нужен защищённый сетевой сервер.' };

    const ice: unknown = iceConfiguration?.trim() ? JSON.parse(iceConfiguration) : [];
    if (!Array.isArray(ice)) throw new Error();
    const iceServers: RTCIceServer[] = ice.map((item: unknown) => {
      if (!item || typeof item !== 'object') throw new Error();
      const fields = item as Record<string, unknown>;
      const urls = typeof fields.urls === 'string' ? [fields.urls] : fields.urls;
      if (
        !Array.isArray(urls) ||
        !urls.length ||
        !urls.every((url) => typeof url === 'string' && /^(stun|stuns|turn|turns):\S+$/.test(url))
      )
        throw new Error();
      if (
        (fields.username !== undefined && typeof fields.username !== 'string') ||
        (fields.credential !== undefined && typeof fields.credential !== 'string')
      )
        throw new Error();
      return {
        urls,
        ...(fields.username !== undefined ? { username: fields.username } : {}),
        ...(fields.credential !== undefined ? { credential: fields.credential } : {}),
      };
    });
    return { configuration: { url: server.toString(), iceServers } };
  } catch {
    return { error: 'Не удалось открыть сетевой режим: проверьте настройки сервера и голоса.' };
  }
}
