import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import App from '../App';
import type { NetworkClientApi } from '../../network/protocol';
import { networkGameProps } from '../../network/session-adapter';
import RoomLobby from './RoomLobby';
import ConnectionBar from './ConnectionBar';
import VoicePanel from './VoicePanel';
import './network.css';

export interface NetworkGameProps {
  client: NetworkClientApi;
  onBack: () => void;
  iceServers?: RTCIceServer[];
  allowTestTone?: boolean;
}

/** The integration point for the existing menu/session. Owns no game state or local save. */
export default function NetworkGame({
  client,
  onBack,
  iceServers,
  allowTestTone = false,
}: NetworkGameProps) {
  const state = useSyncExternalStore(client.subscribe, client.getState, client.getState);
  const [roomOpen, setRoomOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const roomSurface = useRef<HTMLElement>(null);
  const snapshot = state.snapshot;
  const member = snapshot?.room.members.find((item) => item.id === snapshot.memberId);
  const identity = `${snapshot?.room.id}:${snapshot?.authority?.matchId}:${snapshot?.memberId}:${member?.seatId}:${member?.controlEpoch}`;
  const session = useRef({ identity, id: 1 });
  if (session.current.identity !== identity)
    session.current = { identity, id: session.current.id + 1 };
  const inputContext = `${identity}:${state.connection}:${snapshot?.authority?.turnId}:${snapshot?.authority?.controlEpoch}:${snapshot?.room.paused}:${snapshot?.canAct}:${roomOpen}`;
  const input = useRef({ context: inputContext, epoch: 1 });
  if (input.current.context !== inputContext)
    input.current = { context: inputContext, epoch: input.current.epoch + 1 };
  const playing = !!snapshot?.observation && snapshot.room.status !== 'lobby';
  useEffect(() => {
    if (roomOpen) closeButton.current?.focus();
  }, [roomOpen]);
  const back = () => (playing && client.getState().snapshot ? setRoomOpen(false) : onBack());
  return (
    <div
      className="network-experience"
      onKeyDown={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.network-room-surface, .network-bar')
        )
          event.stopPropagation();
      }}
    >
      {playing ? (
        <>
          <div inert={roomOpen}>
            <App
              {...networkGameProps(client, session.current.id)}
              commandsAreAsync
              commandPending={!!state.pendingCommand}
              confirmedCommandId={state.confirmedCommandId}
              interactionEpoch={input.current.epoch}
              canContinue={false}
              canContinueTutorial={false}
              onStartTutorial={() => {}}
              onContinueTutorial={() => {}}
              onStart={() => setRoomOpen(true)}
              onContinue={() => {}}
              onMenu={() => setRoomOpen(true)}
            />
            <ConnectionBar client={client} onOpenRoom={() => setRoomOpen(true)} />
          </div>
        </>
      ) : null}
      <section
        ref={roomSurface}
        className={`network-room-surface${playing ? ' network-room-overlay' : ''}`}
        hidden={playing && !roomOpen}
        role={playing ? 'dialog' : undefined}
        aria-modal={playing && roomOpen ? true : undefined}
        aria-label="Управление комнатой"
        onKeyDown={(event) => {
          if (!playing || !roomOpen || event.defaultPrevented) return;
          if (event.key === 'Escape') {
            event.stopPropagation();
            setRoomOpen(false);
          }
          if (event.key !== 'Tab') return;
          const focusable = [
            ...roomSurface.current!.querySelectorAll<HTMLElement>(
              'button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]',
            ),
          ].filter((element) => element.offsetParent !== null);
          const first = focusable[0],
            last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          }
          if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        {playing && (
          <button
            ref={closeButton}
            className="network-room-close"
            onClick={() => setRoomOpen(false)}
          >
            Вернуться за стол
          </button>
        )}
        <RoomLobby client={client} onBack={back} />
        {snapshot && state.connection !== 'kicked' && (
          <div className="network-voice-container">
            <VoicePanel client={client} iceServers={iceServers} allowTestTone={allowTestTone} />
          </div>
        )}
      </section>
    </div>
  );
}
