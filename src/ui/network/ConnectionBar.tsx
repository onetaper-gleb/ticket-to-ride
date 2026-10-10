import { useEffect, useState, useSyncExternalStore } from 'react';
import type { NetworkClientApi } from '../../network/protocol';
import './network.css';

export interface ConnectionBarProps {
  client: NetworkClientApi;
  onOpenRoom?: () => void;
}

export default function ConnectionBar({ client, onOpenRoom }: ConnectionBarProps) {
  const state = useSyncExternalStore(client.subscribe, client.getState);
  const snapshot = state.snapshot;
  const authority = snapshot?.authority;
  const playing = snapshot?.room.status === 'playing';
  const paused = !!snapshot?.room.paused;
  const deadline = authority?.deadline;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!playing || paused || deadline === null || deadline === undefined) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [playing, paused, deadline]);
  if (!snapshot && state.connection === 'idle') return null;
  const blocked = state.connection !== 'connected';
  const self = snapshot?.room.members.find((member) => member.id === snapshot.memberId);
  const activeSeat = snapshot?.room.seats.find((seat) => seat.id === authority?.activeSeat);
  const activeMember = snapshot?.room.members.find(
    (member) => member.seatId === authority?.activeSeat,
  );
  const ownTurn = !!self && self.seatId === authority?.activeSeat;
  const activeName = activeSeat?.name ?? 'игрок';
  const turnStatus = authority?.awaitingEnd
    ? ownTurn && self?.control === 'human'
      ? 'Ваше действие выполнено: нажмите «Завершить ход».'
      : `Ждём «Завершить ход»: ${activeName}${activeMember?.control === 'bot' ? ' (бот)' : ''}.`
    : ownTurn && self?.control === 'human'
      ? 'Ваш ход.'
      : `Ходит ${activeName}${activeMember?.control === 'bot' || activeSeat?.kind === 'bot' ? ' (бот)' : ''}.`;
  const seconds =
    deadline === null || deadline === undefined
      ? null
      : Math.max(0, Math.ceil((deadline - now) / 1000));
  const clock =
    seconds === null
      ? null
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
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
      {playing && authority && (
        <>
          <span role="status" aria-live="polite">
            {turnStatus}
          </span>
          <span role="timer" aria-live="off">
            {paused
              ? 'Полный ход: отсчёт на паузе.'
              : clock === null
                ? 'Ждём срок хода от сервера.'
                : seconds === 0
                  ? 'Время хода истекло. Ждём передачу управления сервером.'
                  : `До передачи хода, включая «Завершить ход»: ${clock}`}
          </span>
          {(self?.control === 'bot' || self?.returnPending) && (
            <span role="status" aria-live="polite">
              Вашим местом управляет бот.{' '}
              {self.returnPending
                ? 'Управление вернётся в начале следующего вашего хода.'
                : 'После восстановления связи управление вернётся в начале следующего вашего хода.'}
            </span>
          )}
        </>
      )}
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
