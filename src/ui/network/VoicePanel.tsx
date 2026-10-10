import { useEffect, useState, useSyncExternalStore } from 'react';
import type { NetworkClientApi } from '../../network/protocol';
import { createRoomVoice, emptyVoiceState, type RoomVoice } from '../../network/voice';
import './voice.css';

const noopSubscribe = () => () => {};
const getEmptyState = () => emptyVoiceState;
const connectionLabel = (connection: string) =>
  ({
    waiting: 'Ожидаем голос участника',
    new: 'Подключаем голос',
    connecting: 'Подключаем голос',
    connected: 'Голос подключён',
    disconnected: 'Голос временно отключён',
    failed: 'Голос недоступен',
    closed: 'Голос отключён',
  })[connection] ?? 'Голос недоступен';

export interface VoicePanelProps {
  client: NetworkClientApi;
  iceServers?: RTCIceServer[];
  /** Local QA harness only. Production callers must leave this disabled. */
  allowTestTone?: boolean;
}

export function VoicePanel({ client, iceServers, allowTestTone = false }: VoicePanelProps) {
  const [voice, setVoice] = useState<RoomVoice | null>(null);
  useEffect(() => {
    const controller = createRoomVoice(client, { iceServers, allowTestTone });
    setVoice(controller);
    return () => {
      controller.dispose();
    };
  }, [client, iceServers, allowTestTone]);
  const state = useSyncExternalStore(
    voice?.subscribe ?? noopSubscribe,
    voice?.getState ?? getEmptyState,
    getEmptyState,
  );
  const blockedPlayback = state.peers.some((peer) => peer.playbackBlocked);
  const microphoneEnabled = state.microphoneEnabled && state.source === 'microphone';
  const toneEnabled = state.microphoneEnabled && state.source === 'test-tone';
  return (
    <section
      className="room-voice"
      aria-label="Голос участников"
      data-testid="voice-panel"
      data-microphone-enabled={microphoneEnabled}
      data-source={state.source}
    >
      <div className="room-voice-heading">
        <strong>Голос за столом</strong>
        <span>
          {state.microphoneEnabled
            ? state.localSpeaking
              ? 'Вы говорите'
              : 'Звук включён'
            : 'Микрофон выключен'}
        </span>
      </div>
      <p className="room-voice-note">
        Голос необязателен. Микрофон включается только по вашей кнопке. Аудио не записывается.
      </p>
      <div className="room-voice-buttons">
        <button
          type="button"
          data-testid="voice-microphone"
          aria-pressed={microphoneEnabled}
          disabled={!voice || !state.available || state.requestingMicrophone}
          onClick={() => {
            void voice?.resumePlayback();
            void voice?.setMicrophoneEnabled(!microphoneEnabled);
          }}
        >
          {state.requestingMicrophone
            ? 'Ждём разрешения браузера…'
            : microphoneEnabled
              ? 'Выключить микрофон'
              : 'Включить микрофон'}
        </button>
        <button
          type="button"
          disabled={!state.available}
          onClick={() => void voice?.resumePlayback()}
        >
          {blockedPlayback ? 'Разрешить звук собеседников' : 'Включить звук собеседников'}
        </button>
        {allowTestTone && (
          <button
            type="button"
            data-testid="voice-test-tone"
            disabled={!state.available}
            aria-pressed={toneEnabled}
            onClick={() => {
              void voice?.resumePlayback();
              void voice?.setTestToneEnabled(!toneEnabled);
            }}
          >
            {toneEnabled ? 'Остановить тестовый звук' : 'Тестовый звук (без микрофона)'}
          </button>
        )}
      </div>
      {allowTestTone && (
        <p className="room-voice-note">
          Проверка WebRTC: тихий синтетический сигнал 440 Гц. Этот тест не проверяет аппаратный
          микрофон.
        </p>
      )}
      {state.error && (
        <p className="room-voice-error" role="status" data-testid="voice-error">
          {state.error}
        </p>
      )}
      {blockedPlayback && (
        <p className="room-voice-note" role="status">
          Браузер ждёт нажатия «Разрешить звук собеседников».
        </p>
      )}
      <ul className="room-voice-peers">
        {state.peers.map((peer) => (
          <li
            key={peer.memberId}
            data-testid="voice-peer"
            data-member-id={peer.memberId}
            data-connection={peer.connection}
            data-speaking={peer.speaking}
            data-bytes-sent={peer.diagnostics.bytesSent}
            data-bytes-received={peer.diagnostics.bytesReceived}
            data-audio-energy={peer.diagnostics.totalAudioEnergy}
          >
            <div className="room-voice-peer-title">
              <strong>{peer.name}</strong>
              <span>
                {peer.speaking
                  ? 'Говорит'
                  : peer.enabled
                    ? 'Микрофон включён'
                    : 'Микрофон выключен'}
              </span>
            </div>
            <p>{connectionLabel(peer.connection)}</p>
            <div className="room-voice-peer-controls">
              <button
                type="button"
                aria-pressed={peer.muted}
                onClick={() => voice?.setPeerMuted(peer.memberId, !peer.muted)}
              >
                {peer.muted ? `Слушать: ${peer.name}` : `Отключить звук: ${peer.name}`}
              </button>
              <label>
                Громкость: {peer.name}
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(peer.volume * 100)}
                  onChange={(event) =>
                    voice?.setPeerVolume(peer.memberId, Number(event.target.value) / 100)
                  }
                />
              </label>
            </div>
            {peer.error && (
              <p className="room-voice-error" role="status">
                {peer.error}
              </p>
            )}
            {allowTestTone && (
              <details className="room-voice-diagnostics">
                <summary>Диагностика WebRTC</summary>
                <p data-testid="voice-stats">
                  Отправлено: {peer.diagnostics.bytesSent} байт · Получено:{' '}
                  {peer.diagnostics.bytesReceived} байт · Энергия аудио:{' '}
                  {peer.diagnostics.totalAudioEnergy.toFixed(6)}
                </p>
                <p>
                  ICE: {peer.diagnostics.iceConnectionState} · SDP:{' '}
                  {peer.diagnostics.signalingState}
                </p>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default VoicePanel;
