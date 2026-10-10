import { useSyncExternalStore } from 'react';
import type { NetworkClientApi } from '../../network/protocol';
import './network.css';

export interface ConnectionBarProps {
  client: NetworkClientApi;
  onOpenRoom?: () => void;
}

export default function ConnectionBar({ client, onOpenRoom }: ConnectionBarProps) {
  const state = useSyncExternalStore(client.subscribe, client.getState);
  const snapshot = state.snapshot;
  if (!snapshot && state.connection === 'idle') return null;
  const blocked = state.connection !== 'connected';
  return (
    <aside className="network-bar" aria-label="Сетевая комната">
      <span role="status" aria-live="polite">
        {state.connection === 'reconnecting' || state.connection === 'connecting'
          ? 'Восстанавливаем связь…'
          : state.connection === 'disconnected'
            ? 'Нет связи'
            : state.connection === 'kicked'
              ? 'Доступ закрыт'
              : snapshot?.room.paused
                ? 'Пауза'
                : state.pendingCommand || state.pendingRequest
                  ? 'Ждём подтверждения…'
                  : `Комната ${snapshot?.room.code ?? ''}`}
      </span>
      {blocked && <button onClick={() => client.reconnect()}>Повторить</button>}
      {onOpenRoom && <button onClick={onOpenRoom}>Комната и голос</button>}
      {state.error && (
        <span className="network-bar-error" role="alert">
          {state.error}
        </span>
      )}
    </aside>
  );
}
