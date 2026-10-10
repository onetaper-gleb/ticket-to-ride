import { useRef, useState, useSyncExternalStore } from 'react';
import type { ExpectedRoom, NetworkClientApi, RoomAction, SeatCount } from '../../network/protocol';
import './network.css';

export interface RoomLobbyProps {
  client: NetworkClientApi;
  onBack: () => void;
}

function inviteCode() {
  try {
    return new URL(location.href).searchParams.get('room') ?? '';
  } catch {
    return '';
  }
}
function invitation(code: string) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

export default function RoomLobby({ client, onBack }: RoomLobbyProps) {
  const state = useSyncExternalStore(client.subscribe, client.getState);
  const [name, setName] = useState('Игрок');
  const [code, setCode] = useState(inviteCode);
  const [seats, setSeats] = useState<SeatCount>(3);
  const [copied, setCopied] = useState('');
  const [confirm, setConfirm] = useState<{
    title: string;
    detail: string;
    action: RoomAction;
    expected: ExpectedRoom;
  } | null>(null);
  const confirmation = useRef<HTMLElement>(null);
  const snapshot = state.snapshot;
  const room = snapshot?.room;
  const self = room?.members.find((member) => member.id === snapshot?.memberId);
  const host = room?.members.find((member) => member.id === room.hostId);
  const isHost = !!snapshot && room?.hostId === snapshot.memberId;
  const busy =
    state.connection === 'connecting' ||
    state.connection === 'reconnecting' ||
    !!state.pendingRequest ||
    !!state.pendingCommand;
  const ready = state.connection === 'connected' && !busy;
  const confirmationStale =
    !!confirm &&
    (confirm.expected.roomId !== room?.id ||
      (confirm.action.type !== 'leave' && confirm.expected.revision !== room?.revision) ||
      (confirm.action.type === 'endMatch' &&
        confirm.action.matchId !== snapshot?.authority?.matchId));
  const expectedRoom = room ? { roomId: room.id, revision: room.revision } : undefined;
  const action = (next: RoomAction, expected = expectedRoom) => {
    if (!expected) return;
    if (next.type === 'leave') {
      if (client.getState().snapshot?.room.id !== expected.roomId) {
        setConfirm(null);
        return;
      }
      client.leave(expected.roomId);
      setConfirm(null);
      onBack();
      return;
    }
    if (client.roomAction(next, expected)) setConfirm(null);
  };
  return (
    <section className="network-panel" aria-labelledby="room-title">
      <header className="network-heading">
        <div>
          <span className="eyebrow">Europe · частная комната</span>
          <h2 id="room-title">{room ? `Комната ${room.code}` : 'Игра с друзьями'}</h2>
        </div>
        <button className="quiet-button" onClick={onBack}>
          {room?.status === 'playing' ? 'Вернуться к игре' : 'Назад'}
        </button>
      </header>
      <p className="network-status" role="status" aria-live="polite">
        {state.connection === 'reconnecting'
          ? 'Связь потеряна. Ваше место сохраняется, восстанавливаем соединение.'
          : state.connection === 'connecting'
            ? 'Подключаемся к серверу…'
            : busy
              ? 'Ждём подтверждения сервера…'
              : state.connection === 'disconnected'
                ? 'Нет связи с сервером. Действия временно недоступны.'
                : state.connection === 'kicked'
                  ? 'Вы вышли из комнаты по решению ведущего.'
                  : room
                    ? 'Соединение установлено.'
                    : 'Создайте комнату или введите код приглашения.'}
      </p>
      {state.error && (
        <div className="network-error" role="alert">
          <p>{state.error}</p>
          <button className="quiet-button" onClick={() => client.clearError()}>
            Скрыть сообщение
          </button>
        </div>
      )}
      {(state.connection === 'disconnected' || state.connection === 'reconnecting') && (
        <button className="button" onClick={() => client.reconnect()}>
          Повторить соединение
        </button>
      )}
      {!room ? (
        <form
          className="network-join"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && code.trim() && !busy) client.join(name, code);
          }}
        >
          <label>
            Ваше имя
            <input
              maxLength={40}
              autoComplete="nickname"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
            />
          </label>
          <div className="network-entry-grid">
            <fieldset disabled={busy}>
              <legend>Создать комнату</legend>
              <label>
                Количество мест
                <select
                  value={seats}
                  onChange={(event) => setSeats(Number(event.target.value) as SeatCount)}
                >
                  {[2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button primary"
                disabled={!name.trim()}
                onClick={() =>
                  client.create(name, {
                    seats,
                    difficulty: 'normal',
                    turnSeconds: 180,
                    admissionOpen: true,
                  })
                }
              >
                Создать
              </button>
            </fieldset>
            <fieldset disabled={busy}>
              <legend>Войти по приглашению</legend>
              <label>
                Код комнаты
                <input
                  value={code}
                  maxLength={32}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                />
              </label>
              <button className="button" type="submit" disabled={!name.trim() || !code.trim()}>
                Войти
              </button>
            </fieldset>
          </div>
        </form>
      ) : (
        <>
          <div className="network-invite">
            <label>
              Ссылка приглашения
              <input
                readOnly
                value={invitation(room.code)}
                onFocus={(event) => event.target.select()}
              />
            </label>
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invitation(room.code));
                  setCopied('Ссылка скопирована.');
                } catch {
                  setCopied('Выделите и скопируйте ссылку в поле.');
                }
              }}
            >
              Скопировать
            </button>
            <span role="status">{copied}</span>
          </div>
          <p>
            Ведущий: <strong>{host?.name ?? 'ожидаем назначения'}</strong>.{' '}
            {room.status === 'lobby'
              ? 'Перед началом все участники должны подтвердить готовность.'
              : room.status === 'finished'
                ? 'Матч завершён. Ведущий может вернуть комнату в лобби.'
                : 'Идёт партия.'}
          </p>
          <ol className="network-seats" aria-label="Места за столом">
            {room.seats.map((seat) => {
              const member = room.members.find((item) => item.id === seat.memberId);
              return (
                <li key={seat.id}>
                  <div>
                    <strong>
                      Место {seat.id + 1} · {seat.kind === 'open' ? 'Свободно' : seat.name}
                    </strong>
                    <p>
                      {member
                        ? `${member.connected ? 'На связи' : 'Отключён'} · ${member.ready ? 'Готов' : 'Не готов'}${member.id === room.hostId ? ' · ведущий' : ''}${member.id === self?.id ? ' · вы' : ''}${member.control === 'bot' ? ' · управление у бота' : ''}${member.returnPending ? ' · вернётся на следующем своём ходу' : ''}`
                        : seat.kind === 'bot'
                          ? 'Бот'
                          : 'Можно занять место'}
                    </p>
                  </div>
                  <div className="network-actions">
                    {room.status === 'lobby' && seat.kind === 'open' && (
                      <button
                        className="quiet-button"
                        disabled={!ready}
                        onClick={() => action({ type: 'seat', seatId: seat.id })}
                      >
                        Занять
                      </button>
                    )}
                    {room.status === 'lobby' && isHost && seat.kind !== 'human' && (
                      <button
                        className="quiet-button"
                        disabled={!ready}
                        onClick={() =>
                          action({ type: 'bot', seatId: seat.id, enabled: seat.kind !== 'bot' })
                        }
                      >
                        {seat.kind === 'bot' ? 'Убрать бота' : 'Добавить бота'}
                      </button>
                    )}
                    {isHost && member && member.id !== self?.id && (
                      <button
                        className="quiet-button"
                        disabled={!ready}
                        onClick={() =>
                          setConfirm({
                            title: `Удалить ${member.name}?`,
                            detail:
                              room.status === 'playing'
                                ? 'Участник потеряет доступ к комнате и голосу. Его место продолжит играть бот; принятые ходы сохранятся.'
                                : 'Участник потеряет доступ к комнате и голосу.',
                            action: { type: 'kick', memberId: member.id },
                            expected: { roomId: room.id, revision: room.revision },
                          })
                        }
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {room.status === 'lobby' && self && (
            <button
              className={`button ${self.ready ? '' : 'primary'}`}
              disabled={!ready}
              onClick={() => action({ type: 'ready', ready: !self.ready })}
            >
              {self.ready ? 'Отменить готовность' : 'Я готов'}
            </button>
          )}
          {isHost && (
            <fieldset className="network-host" disabled={!ready}>
              <legend>Управление ведущего</legend>
              {room.status === 'lobby' && (
                <>
                  <label>
                    Количество мест
                    <select
                      value={room.settings.seats}
                      onChange={(event) =>
                        action({
                          type: 'settings',
                          settings: { seats: Number(event.target.value) as SeatCount },
                        })
                      }
                    >
                      {[2, 3, 4, 5].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Боты
                    <select
                      value={room.settings.difficulty}
                      onChange={(event) =>
                        action({
                          type: 'settings',
                          settings: { difficulty: event.target.value as 'easy' | 'normal' },
                        })
                      }
                    >
                      <option value="easy">Лёгкие</option>
                      <option value="normal">Обычные</option>
                    </select>
                  </label>
                  <label>
                    Время на весь ход
                    <select
                      value={room.settings.turnSeconds}
                      onChange={(event) =>
                        action({
                          type: 'settings',
                          settings: { turnSeconds: Number(event.target.value) },
                        })
                      }
                    >
                      {[60, 120, 180, 300, 600].map((value) => (
                        <option key={value} value={value}>
                          {value} секунд
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button primary"
                    disabled={
                      room.members.some((member) => !member.ready || !member.connected) ||
                      room.seats.some((seat) => seat.kind === 'open')
                    }
                    onClick={() => action({ type: 'start' })}
                  >
                    Начать партию
                  </button>
                </>
              )}
              <label className="network-checkbox">
                <input
                  type="checkbox"
                  checked={room.settings.admissionOpen}
                  onChange={(event) =>
                    action({ type: 'settings', settings: { admissionOpen: event.target.checked } })
                  }
                />
                Принимать новых участников
              </label>
              {room.status === 'playing' && (
                <div className="network-actions">
                  <button
                    className="button"
                    onClick={() => action({ type: 'pause', paused: !room.paused })}
                  >
                    {room.paused ? 'Продолжить партию' : 'Поставить на паузу'}
                  </button>
                  <button
                    className="quiet-button"
                    disabled={!snapshot.authority}
                    onClick={() =>
                      snapshot.authority &&
                      setConfirm({
                        title: 'Завершить текущий матч?',
                        detail:
                          'Игра остановится для всех участников. Продолжить этот матч будет нельзя; комната сохранится.',
                        action: {
                          type: 'endMatch',
                          matchId: snapshot.authority.matchId,
                          confirmed: true,
                        },
                        expected: { roomId: room.id, revision: room.revision },
                      })
                    }
                  >
                    Завершить матч…
                  </button>
                </div>
              )}
              {room.status === 'finished' && (
                <button className="button" onClick={() => action({ type: 'lobby' })}>
                  Вернуть комнату в лобби
                </button>
              )}
            </fieldset>
          )}
          {room.paused && (
            <p className="network-status" role="status">
              Партия на паузе:{' '}
              {room.pauseReason === 'disconnected' ? 'все люди отключены' : 'решение ведущего'}.
              Принятый ход сохранён.
            </p>
          )}
          <p className="network-note">
            На весь ход выделен один срок: он включает добор, выбор билетов, доплату и нажатие
            «Завершить ход». Оставшееся время видно в игре. Когда срок истечёт, управление получит
            бот, даже если вы на связи. Подключённый игрок получит управление обратно в начале
            следующего своего хода. При общей паузе время не расходуется.
          </p>
          <button
            className="quiet-button"
            onClick={() =>
              setConfirm({
                title: 'Выйти из комнаты?',
                detail:
                  room.status === 'playing'
                    ? 'Голос отключится, а управление вашим местом получит бот. Доступ к этому месту по сохранённому входу будет удалён.'
                    : 'Голос отключится, а сохранённый вход в эту комнату будет удалён.',
                action: { type: 'leave' },
                expected: { roomId: room.id, revision: room.revision },
              })
            }
          >
            Выйти из комнаты…
          </button>
        </>
      )}
      {confirm && (isHost || confirm.action.type === 'leave') && (
        <div className="network-confirm-backdrop">
          <section
            ref={confirmation}
            className="network-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="network-confirm-title"
            aria-describedby="network-confirm-detail"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setConfirm(null);
              }
              if (event.key !== 'Tab') return;
              const buttons =
                confirmation.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
              const first = buttons?.[0];
              const last = buttons?.[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
          >
            <h3 id="network-confirm-title">{confirm.title}</h3>
            <p id="network-confirm-detail">{confirm.detail}</p>
            {confirmationStale && (
              <p role="alert">Комната изменилась. Отмените подтверждение и откройте его заново.</p>
            )}
            <div className="network-actions">
              <button
                className="button primary"
                disabled={
                  confirmationStale ||
                  (confirm.action.type !== 'leave' &&
                    (!ready || (confirm.action.type === 'endMatch' && room?.status !== 'playing')))
                }
                onClick={() => action(confirm.action, confirm.expected)}
              >
                {confirm.action.type === 'leave' ? 'Выйти' : 'Подтвердить'}
              </button>
              <button className="button" onClick={() => setConfirm(null)} autoFocus>
                Отмена
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
