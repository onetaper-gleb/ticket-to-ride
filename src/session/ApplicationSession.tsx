import { useEffect, useRef, useState } from 'react';
import { createNetworkClient } from '../network/client';
import type { NetworkClientApi } from '../network/protocol';
import NetworkGame from '../ui/network/NetworkGame';
import GameSession from './GameSession';
import {
  initialSessionMode,
  networkConfiguration,
  type NetworkConfiguration,
} from './network-configuration';

function NetworkMode({
  configuration,
  onBack,
}: {
  configuration: NetworkConfiguration;
  onBack: () => void;
}) {
  const [instance, setInstance] = useState<{ client: NetworkClientApi; id: number } | null>(null);
  const nextId = useRef(0);
  const activeId = useRef<number | null>(null);
  useEffect(() => {
    let client: NetworkClientApi | null = null;
    let unsubscribeAddress: (() => void) | null = null;
    function open() {
      client = createNetworkClient({ url: configuration.url });
      const current = client;
      const syncAddress = () => {
        const roomCode = current.getState().snapshot?.room.code;
        if (!roomCode) return;
        const address = new URL(window.location.href);
        if (address.searchParams.get('room') === roomCode) return;
        address.searchParams.set('room', roomCode);
        window.history.replaceState(null, '', address);
      };
      unsubscribeAddress = current.subscribe(syncAddress);
      syncAddress();
      activeId.current = ++nextId.current;
      setInstance({ client, id: activeId.current });
    }
    function dispose() {
      activeId.current = null;
      unsubscribeAddress?.();
      unsubscribeAddress = null;
      client?.dispose();
      client = null;
    }
    function hide() {
      dispose();
      setInstance(null);
    }
    function restore(event: PageTransitionEvent) {
      if (event.persisted && !client) open();
    }
    open();
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', restore);
      dispose();
    };
  }, [configuration.url]);
  if (!instance) return <p role="status">Открываем сетевой режим…</p>;
  return (
    <NetworkGame
      key={instance.id}
      client={instance.client}
      iceServers={configuration.iceServers}
      allowTestTone={false}
      onBack={() => {
        if (activeId.current !== instance.id) return;
        activeId.current = null;
        instance.client.leave(instance.client.getState().snapshot?.room.id);
        onBack();
      }}
    />
  );
}

export default function ApplicationSession() {
  const [mode, setMode] = useState(() => initialSessionMode(window.location.search));
  function back() {
    const address = new URL(window.location.href);
    address.searchParams.delete('room');
    window.history.replaceState(null, '', address);
    setMode('solo');
  }
  if (mode === 'solo') return <GameSession onOpenNetwork={() => setMode('network')} />;
  const result = networkConfiguration(
    window.location.origin,
    import.meta.env.VITE_NETWORK_URL,
    import.meta.env.VITE_NETWORK_ICE_SERVERS,
  );
  if (result.error)
    return (
      <main className="network-panel">
        <h2>Игра с друзьями</h2>
        <p role="alert">{result.error}</p>
        <button className="button" onClick={back}>
          Вернуться в меню
        </button>
      </main>
    );
  return <NetworkMode configuration={result.configuration!} onBack={back} />;
}
