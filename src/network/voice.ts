import type { NetworkClientApi, RoomMember, VoiceSignal } from './protocol';

export interface VoicePeerState {
  memberId: string;
  name: string;
  enabled: boolean;
  muted: boolean;
  volume: number;
  speaking: boolean;
  connection: RTCPeerConnectionState | 'waiting';
  error: string | null;
  playbackBlocked: boolean;
  diagnostics: {
    generation: string | null;
    signalingState: RTCSignalingState | 'waiting';
    iceConnectionState: RTCIceConnectionState | 'waiting';
    iceGatheringState: RTCIceGatheringState | 'waiting';
    localDescriptions: number;
    sentDescriptions: number;
    remoteDescriptions: number;
    appliedDescriptions: number;
    localDescriptionType: 'none' | 'offer' | 'answer';
    remoteDescriptionType: 'none' | 'offer' | 'answer';
    localCandidates: number;
    sentCandidates: number;
    receivedCandidates: number;
    appliedCandidates: number;
    bufferedCandidates: number;
    ignoredCandidates: number;
    candidateErrors: number;
    localHostCandidates: number;
    localSrflxCandidates: number;
    localRelayCandidates: number;
    candidatePairs: number;
    succeededPairs: number;
    failedPairs: number;
    nominatedPairs: number;
    selectedPairState: string;
    selectedLocalCandidateType: string;
    selectedRemoteCandidateType: string;
    bytesSent: number;
    bytesReceived: number;
    totalAudioEnergy: number;
    audioLevel: number;
  };
}
export interface RoomVoiceState {
  roomId: string | null;
  available: boolean;
  microphoneEnabled: boolean;
  requestingMicrophone: boolean;
  permission: 'idle' | 'granted' | 'denied' | 'unavailable';
  source: 'none' | 'microphone' | 'test-tone';
  localSpeaking: boolean;
  error: string | null;
  peers: VoicePeerState[];
}
/** Browser dependencies can be supplied by unit tests; they do not replace a media-flow test. */
export interface VoiceEnvironment {
  createPeer(configuration: RTCConfiguration): RTCPeerConnection;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createAudio(): HTMLAudioElement;
  createAudioContext(): AudioContext;
  createStream(tracks: MediaStreamTrack[]): MediaStream;
  sessionId(): string;
  onPageHide?(listener: () => void): () => void;
}
export interface RoomVoiceOptions {
  iceServers?: RTCIceServer[];
  allowTestTone?: boolean;
  environment?: VoiceEnvironment;
}
export interface RoomVoice {
  getState(): RoomVoiceState;
  subscribe(listener: () => void): () => void;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  setPeerVolume(memberId: string, volume: number): void;
  setPeerMuted(memberId: string, muted: boolean): void;
  setTestToneEnabled(enabled: boolean): Promise<void>;
  resumePlayback(): Promise<void>;
  dispose(): void;
}
export const emptyVoiceState: RoomVoiceState = {
  roomId: null,
  available: false,
  microphoneEnabled: false,
  requestingMicrophone: false,
  permission: 'idle',
  source: 'none',
  localSpeaking: false,
  error: null,
  peers: [],
};

type Meter = {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
};
type Peer = {
  member: RoomMember;
  state: VoicePeerState;
  remoteSession: string | null;
  retiredSessions: Set<string>;
  generation: string | null;
  pc: RTCPeerConnection | null;
  sender: RTCRtpSender | null;
  audio: HTMLAudioElement | null;
  meter: Meter | null;
  makingOffer: boolean;
  settingRemoteAnswer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: Array<{ candidate: RTCIceCandidateInit | null; suppressErrors: boolean }>;
  remoteUfrags: Set<string>;
  retiredUfrags: Set<string>;
  ignoredUfrags: Set<string>;
  queue: Promise<void>;
  alive: boolean;
};

const browserEnvironment = (): VoiceEnvironment => ({
  createPeer: (configuration) => new RTCPeerConnection(configuration),
  getUserMedia: (constraints) => {
    if (!navigator.mediaDevices?.getUserMedia)
      return Promise.reject(new DOMException('Microphone unavailable', 'NotSupportedError'));
    return navigator.mediaDevices.getUserMedia(constraints);
  },
  createAudio: () => {
    const audio = document.createElement('audio');
    audio.autoplay = true;
    return audio;
  },
  createAudioContext: () => new AudioContext(),
  createStream: (tracks) => new MediaStream(tracks),
  sessionId: () => crypto.randomUUID(),
  onPageHide: (listener) => {
    window.addEventListener('pagehide', listener);
    return () => window.removeEventListener('pagehide', listener);
  },
});
const microphoneError = (error: unknown): string => {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Доступ к микрофону не разрешён. Разрешите его в настройках браузера или играйте без голоса.';
  if (name === 'NotFoundError') return 'Микрофон не найден. Подключите его или играйте без голоса.';
  if (name === 'NotReadableError') return 'Микрофон занят другим приложением или недоступен.';
  if (name === 'NotSupportedError')
    return 'Микрофон требует HTTPS или localhost и поддержки браузера.';
  return 'Не удалось включить микрофон. Партия может продолжаться без голоса.';
};
const ufrags = (sdp = '') =>
  new Set(Array.from(sdp.matchAll(/^a=ice-ufrag:(.+)$/gm), (m) => m[1]!.trim()));
const rms = (meter: Meter | null): number => {
  if (!meter) return 0;
  meter.analyser.getFloatTimeDomainData(meter.samples);
  return Math.sqrt(
    meter.samples.reduce((sum, value) => sum + value * value, 0) / meter.samples.length,
  );
};
const count = (value: number) => Math.min(1_000_000, value + 1);
const candidateType = (value: unknown) =>
  typeof value === 'string' && ['host', 'srflx', 'prflx', 'relay'].includes(value)
    ? value
    : 'unknown';
const pairState = (value: unknown) =>
  typeof value === 'string' &&
  ['frozen', 'waiting', 'in-progress', 'failed', 'succeeded'].includes(value)
    ? value
    : 'unknown';
const emptyDiagnostics = (): VoicePeerState['diagnostics'] => ({
  generation: null,
  signalingState: 'waiting',
  iceConnectionState: 'waiting',
  iceGatheringState: 'waiting',
  localDescriptions: 0,
  sentDescriptions: 0,
  remoteDescriptions: 0,
  appliedDescriptions: 0,
  localDescriptionType: 'none',
  remoteDescriptionType: 'none',
  localCandidates: 0,
  sentCandidates: 0,
  receivedCandidates: 0,
  appliedCandidates: 0,
  bufferedCandidates: 0,
  ignoredCandidates: 0,
  candidateErrors: 0,
  localHostCandidates: 0,
  localSrflxCandidates: 0,
  localRelayCandidates: 0,
  candidatePairs: 0,
  succeededPairs: 0,
  failedPairs: 0,
  nominatedPairs: 0,
  selectedPairState: 'none',
  selectedLocalCandidateType: 'none',
  selectedRemoteCandidateType: 'none',
  bytesSent: 0,
  bytesReceived: 0,
  totalAudioEnergy: 0,
  audioLevel: 0,
});

/** Audio mesh for authenticated, connected room members. No microphone access on construction. */
export function createRoomVoice(
  client: NetworkClientApi,
  options: RoomVoiceOptions = {},
): RoomVoice {
  const env = options.environment ?? browserEnvironment();
  const supported = Boolean(options.environment) || typeof RTCPeerConnection !== 'undefined';
  const listeners = new Set<() => void>();
  const peers = new Map<string, Peer>();
  const retiredSessionsByMember = new Map<string, Set<string>>();
  let state = { ...emptyVoiceState },
    disposed = false,
    memberId: string | null = null,
    roomId: string | null = null,
    localSession = env.sessionId(),
    localStream: MediaStream | null = null,
    audioContext: AudioContext | null = null,
    localMeter: Meter | null = null,
    tone: { context: AudioContext; oscillator: OscillatorNode; gain: GainNode } | null = null,
    requestGeneration = 0,
    monitor: ReturnType<typeof setInterval> | null = null,
    monitorTicks = 0;

  const publish = () => {
    if (disposed) return;
    state = {
      ...state,
      peers: [...peers.values()].map((peer) => ({
        ...peer.state,
        diagnostics: { ...peer.state.diagnostics },
      })),
    };
    for (const listener of listeners) listener();
  };
  const live = (peer: Peer) => !disposed && peer.alive && peers.get(peer.member.id) === peer;
  const canSignal = (peer: Peer) => {
    const network = client.getState();
    return (
      live(peer) &&
      network.connection === 'connected' &&
      network.snapshot?.room.id === roomId &&
      network.snapshot.memberId === memberId &&
      network.snapshot.room.members.some(
        (member) => member.id === peer.member.id && member.connected,
      )
    );
  };
  const send = (peer: Peer, signal: VoiceSignal) => {
    return canSignal(peer) && client.sendVoice(peer.member.id, signal);
  };
  const sendState = (peer: Peer) =>
    send(peer, { type: 'state', enabled: state.microphoneEnabled, generation: localSession });
  const broadcastState = () => {
    for (const peer of peers.values()) sendState(peer);
  };
  const disconnectMeter = (meter: Meter | null) => {
    meter?.source.disconnect();
    meter?.analyser.disconnect();
  };
  const makeMeter = (stream: MediaStream): Meter | null => {
    try {
      audioContext ??= env.createAudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      return { source, analyser, samples: new Float32Array(analyser.fftSize) };
    } catch {
      return null;
    }
  };
  const closePeerConnection = (peer: Peer) => {
    const pc = peer.pc;
    if (pc) {
      pc.onicecandidate = null;
      pc.onnegotiationneeded = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.close();
    }
    peer.pc = null;
    peer.sender = null;
    if (peer.audio) {
      peer.audio.pause();
      const stream = peer.audio.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
      peer.audio.srcObject = null;
      peer.audio.remove();
    }
    peer.audio = null;
    disconnectMeter(peer.meter);
    peer.meter = null;
    peer.pendingCandidates = [];
    peer.remoteUfrags.clear();
    peer.retiredUfrags.clear();
    peer.ignoredUfrags.clear();
    peer.queue = Promise.resolve();
    peer.makingOffer = peer.settingRemoteAnswer = peer.ignoreOffer = false;
    peer.state.speaking = false;
    peer.state.connection = 'waiting';
    peer.state.playbackBlocked = false;
    peer.state.diagnostics = emptyDiagnostics();
  };
  const closePeer = (peer: Peer) => {
    if (peer.remoteSession) peer.retiredSessions.add(peer.remoteSession);
    retiredSessionsByMember.set(peer.member.id, new Set(peer.retiredSessions));
    peer.alive = false;
    closePeerConnection(peer);
    peers.delete(peer.member.id);
  };
  const stopLocalSource = () => {
    requestGeneration++;
    localStream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    localStream = null;
    disconnectMeter(localMeter);
    localMeter = null;
    if (tone) {
      tone.oscillator.stop();
      tone.oscillator.disconnect();
      tone.gain.disconnect();
      void tone.context.close().catch(() => {});
      tone = null;
    }
    state = {
      ...state,
      microphoneEnabled: false,
      requestingMicrophone: false,
      source: 'none',
      localSpeaking: false,
    };
  };
  const cleanupRoom = () => {
    for (const peer of [...peers.values()]) {
      send(peer, { type: 'leave', generation: localSession });
      closePeer(peer);
    }
    stopLocalSource();
    if (monitor !== null) clearInterval(monitor);
    monitor = null;
    monitorTicks = 0;
    retiredSessionsByMember.clear();
    void audioContext?.close().catch(() => {});
    audioContext = null;
    memberId = roomId = null;
    localSession = env.sessionId();
    state = { ...emptyVoiceState };
  };
  const queue = (
    peer: Peer,
    task: (pc: RTCPeerConnection, generation: string) => Promise<void>,
  ) => {
    const pc = peer.pc,
      generation = peer.generation;
    if (!pc || !generation) return;
    peer.queue = peer.queue
      .then(async () => {
        if (!live(peer) || peer.pc !== pc || peer.generation !== generation) return;
        await task(pc, generation);
      })
      .catch(() => {
        if (!live(peer) || peer.pc !== pc) return;
        peer.state.error =
          'Не удалось согласовать голосовое соединение. Партия продолжается без него.';
        publish();
      });
  };
  const tryPlayback = async (peer: Peer) => {
    const audio = peer.audio;
    if (!audio) return;
    try {
      await audio.play();
      if (live(peer) && peer.audio === audio) peer.state.playbackBlocked = false;
    } catch {
      if (live(peer) && peer.audio === audio) peer.state.playbackBlocked = true;
    }
    publish();
  };
  const connectPeer = (peer: Peer) => {
    if (!live(peer) || !memberId || !peer.remoteSession || peer.pc) return;
    const pair = [
      [memberId, localSession],
      [peer.member.id, peer.remoteSession],
    ].sort((a, b) => a[0]!.localeCompare(b[0]!));
    const generation = JSON.stringify(pair);
    const pc = env.createPeer({ iceServers: options.iceServers ?? [] });
    peer.pc = pc;
    peer.generation = generation;
    peer.state.diagnostics.generation = generation;
    peer.state.error = null;
    const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    peer.sender = transceiver.sender;
    if (localStream)
      void peer.sender.replaceTrack(localStream.getAudioTracks()[0] ?? null).catch(() => {});
    pc.onicecandidate = (event) => {
      if (!live(peer) || peer.pc !== pc) return;
      const diagnostics = peer.state.diagnostics;
      if (event.candidate) {
        diagnostics.localCandidates = count(diagnostics.localCandidates);
        const type = candidateType(event.candidate.type);
        if (type === 'host')
          diagnostics.localHostCandidates = count(diagnostics.localHostCandidates);
        if (type === 'srflx')
          diagnostics.localSrflxCandidates = count(diagnostics.localSrflxCandidates);
        if (type === 'relay')
          diagnostics.localRelayCandidates = count(diagnostics.localRelayCandidates);
      }
      const sent = send(peer, {
        type: 'candidate',
        candidate: event.candidate?.toJSON() ?? null,
        generation,
      });
      if (sent && event.candidate) diagnostics.sentCandidates = count(diagnostics.sentCandidates);
      diagnostics.iceGatheringState = pc.iceGatheringState;
      publish();
    };
    pc.onnegotiationneeded = () =>
      queue(peer, async (current, currentGeneration) => {
        try {
          peer.makingOffer = true;
          await current.setLocalDescription();
          if (live(peer) && peer.pc === current && current.localDescription) {
            const diagnostics = peer.state.diagnostics;
            diagnostics.localDescriptions = count(diagnostics.localDescriptions);
            diagnostics.localDescriptionType =
              current.localDescription.type === 'offer' ? 'offer' : 'answer';
            const sent = send(peer, {
              type: 'description',
              description: current.localDescription.toJSON(),
              generation: currentGeneration,
            });
            if (sent) diagnostics.sentDescriptions = count(diagnostics.sentDescriptions);
            publish();
          }
        } finally {
          if (peer.pc === current) peer.makingOffer = false;
        }
      });
    pc.ontrack = (event) => {
      if (!live(peer) || peer.pc !== pc || event.track.kind !== 'audio') return;
      const stream = event.streams[0] ?? env.createStream([event.track]);
      if (!peer.audio) peer.audio = env.createAudio();
      peer.audio.srcObject = stream;
      peer.audio.volume = peer.state.volume;
      peer.audio.muted = peer.state.muted;
      disconnectMeter(peer.meter);
      peer.meter = makeMeter(stream);
      void tryPlayback(peer);
    };
    const connectionChanged = () => {
      if (!live(peer) || peer.pc !== pc) return;
      peer.state.connection = pc.connectionState;
      peer.state.diagnostics.signalingState = pc.signalingState;
      peer.state.diagnostics.iceConnectionState = pc.iceConnectionState;
      peer.state.diagnostics.iceGatheringState = pc.iceGatheringState;
      if (pc.connectionState === 'failed')
        peer.state.error =
          'Голосовое соединение не установлено. Для внешней сети может потребоваться TURN.';
      if (pc.connectionState === 'connected') peer.state.error = null;
      publish();
    };
    pc.onconnectionstatechange = connectionChanged;
    pc.oniceconnectionstatechange = connectionChanged;
    pc.onsignalingstatechange = connectionChanged;
    connectionChanged();
  };
  const addCandidate = async (
    peer: Peer,
    pc: RTCPeerConnection,
    candidate: RTCIceCandidateInit | null,
    suppressErrors = false,
  ) => {
    if (candidate?.usernameFragment && peer.retiredUfrags.has(candidate.usernameFragment)) return;
    try {
      if (candidate) await pc.addIceCandidate(candidate);
      else await pc.addIceCandidate();
      if (candidate && live(peer) && peer.pc === pc)
        peer.state.diagnostics.appliedCandidates = count(peer.state.diagnostics.appliedCandidates);
    } catch (error) {
      if (!live(peer) || peer.pc !== pc) return;
      if (suppressErrors) {
        if (candidate)
          peer.state.diagnostics.ignoredCandidates = count(
            peer.state.diagnostics.ignoredCandidates,
          );
        return;
      }
      peer.state.diagnostics.candidateErrors = count(peer.state.diagnostics.candidateErrors);
      throw error;
    }
  };
  const receive = (fromId: string, signal: VoiceSignal) => {
    const peer = peers.get(fromId);
    // Identity comes exclusively from the authenticated room snapshot, never an incoming signal.
    if (
      !peer ||
      !canSignal(peer) ||
      fromId === memberId ||
      typeof signal.generation !== 'string' ||
      signal.generation.length > 256 ||
      !signal.generation
    )
      return;
    if (signal.type === 'state') {
      if (peer.retiredSessions.has(signal.generation)) return;
      const changed = peer.remoteSession !== signal.generation;
      if (changed) {
        if (peer.remoteSession) peer.retiredSessions.add(peer.remoteSession);
        closePeerConnection(peer);
        peer.remoteSession = signal.generation;
        peer.generation = null;
      }
      peer.state.enabled = signal.enabled;
      if (changed) sendState(peer);
      try {
        connectPeer(peer);
      } catch {
        peer.state.error = 'Браузер не поддерживает голосовое соединение.';
      }
      publish();
      return;
    }
    if (signal.type === 'leave') {
      if (signal.generation !== peer.remoteSession) return;
      peer.retiredSessions.add(signal.generation);
      closePeerConnection(peer);
      peer.remoteSession = peer.generation = null;
      peer.state.enabled = false;
      publish();
      return;
    }
    if (signal.generation !== peer.generation) return;
    if (signal.type === 'candidate' && signal.candidate)
      peer.state.diagnostics.receivedCandidates = count(peer.state.diagnostics.receivedCandidates);
    if (signal.type === 'description')
      peer.state.diagnostics.remoteDescriptions = count(peer.state.diagnostics.remoteDescriptions);
    queue(peer, async (pc, generation) => {
      if (signal.type === 'candidate') {
        const fragment = signal.candidate?.usernameFragment;
        if (fragment && peer.retiredUfrags.has(fragment)) {
          if (signal.candidate)
            peer.state.diagnostics.ignoredCandidates = count(
              peer.state.diagnostics.ignoredCandidates,
            );
          publish();
          return;
        }
        if (!pc.remoteDescription || (fragment && !peer.remoteUfrags.has(fragment))) {
          if (peer.pendingCandidates.length < 128)
            peer.pendingCandidates.push({
              candidate: signal.candidate,
              suppressErrors: fragment ? peer.ignoredUfrags.has(fragment) : peer.ignoreOffer,
            });
          peer.state.diagnostics.bufferedCandidates = peer.pendingCandidates.length;
          publish();
          return;
        }
        // Ignoring a colliding offer must not discard late ICE for the accepted remote SDP.
        // Candidates without a ufrag are tried against that SDP; glare errors stay optional.
        await addCandidate(peer, pc, signal.candidate, !fragment && peer.ignoreOffer);
        publish();
        return;
      }
      const description = signal.description;
      if (description.type !== 'offer' && description.type !== 'answer') return;
      const readyForOffer =
        !peer.makingOffer && (pc.signalingState === 'stable' || peer.settingRemoteAnswer);
      const collision = description.type === 'offer' && !readyForOffer;
      const polite = memberId!.localeCompare(peer.member.id) > 0;
      peer.ignoreOffer = !polite && collision;
      if (peer.ignoreOffer) {
        for (const fragment of ufrags(description.sdp))
          if (!peer.remoteUfrags.has(fragment)) peer.ignoredUfrags.add(fragment);
        return;
      }
      peer.settingRemoteAnswer = description.type === 'answer';
      try {
        await pc.setRemoteDescription(description);
      } finally {
        if (peer.pc === pc) peer.settingRemoteAnswer = false;
      }
      if (!live(peer) || peer.pc !== pc || peer.generation !== generation) return;
      peer.state.diagnostics.appliedDescriptions = count(
        peer.state.diagnostics.appliedDescriptions,
      );
      peer.state.diagnostics.remoteDescriptionType = description.type;
      const currentUfrags = ufrags(description.sdp);
      // An accepted SDP may reuse credentials from an offer previously rolled back or ignored.
      for (const current of currentUfrags) peer.retiredUfrags.delete(current);
      for (const old of peer.remoteUfrags) if (!currentUfrags.has(old)) peer.retiredUfrags.add(old);
      for (const ignored of peer.ignoredUfrags)
        if (!currentUfrags.has(ignored)) peer.retiredUfrags.add(ignored);
      peer.ignoredUfrags.clear();
      peer.remoteUfrags = currentUfrags;
      const pending = peer.pendingCandidates;
      peer.pendingCandidates = [];
      for (const item of pending) {
        if (!live(peer) || peer.pc !== pc || peer.generation !== generation) return;
        const candidate = item.candidate;
        const fragment = candidate?.usernameFragment;
        if (!fragment || currentUfrags.has(fragment))
          await addCandidate(peer, pc, candidate, !fragment && item.suppressErrors);
        else if (!peer.retiredUfrags.has(fragment)) peer.pendingCandidates.push(item);
        else if (candidate)
          peer.state.diagnostics.ignoredCandidates = count(
            peer.state.diagnostics.ignoredCandidates,
          );
      }
      if (!live(peer) || peer.pc !== pc || peer.generation !== generation) return;
      peer.state.diagnostics.bufferedCandidates = peer.pendingCandidates.length;
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        if (live(peer) && peer.pc === pc && pc.localDescription) {
          const diagnostics = peer.state.diagnostics;
          diagnostics.localDescriptions = count(diagnostics.localDescriptions);
          diagnostics.localDescriptionType =
            pc.localDescription.type === 'offer' ? 'offer' : 'answer';
          const sent = send(peer, {
            type: 'description',
            description: pc.localDescription.toJSON(),
            generation,
          });
          if (sent) diagnostics.sentDescriptions = count(diagnostics.sentDescriptions);
        }
      }
      publish();
    });
  };

  const pollStats = async (peer: Peer) => {
    const pc = peer.pc;
    if (!pc) return;
    try {
      const report = await pc.getStats();
      if (!live(peer) || peer.pc !== pc) return;
      let bytesSent = 0,
        bytesReceived = 0,
        energy = 0,
        audioLevel = 0;
      const pairs: Array<{
        id: string;
        state: unknown;
        nominated: boolean;
        localCandidateId: string;
        remoteCandidateId: string;
      }> = [];
      const types = new Map<string, string>();
      let selectedPairId: string | null = null;
      report.forEach((stat) => {
        if (stat.type === 'transport' && typeof stat.selectedCandidatePairId === 'string')
          selectedPairId = stat.selectedCandidatePairId;
        if (stat.type === 'candidate-pair')
          pairs.push({
            id: stat.id,
            state: stat.state,
            nominated: stat.nominated === true,
            localCandidateId: stat.localCandidateId,
            remoteCandidateId: stat.remoteCandidateId,
          });
        if (stat.type === 'local-candidate' || stat.type === 'remote-candidate')
          types.set(stat.id, candidateType(stat.candidateType));
        if ((stat.kind ?? stat.mediaType) !== 'audio') return;
        if (stat.type === 'outbound-rtp') bytesSent += stat.bytesSent ?? 0;
        if (stat.type === 'inbound-rtp') {
          bytesReceived += stat.bytesReceived ?? 0;
          energy += stat.totalAudioEnergy ?? 0;
          audioLevel = Math.max(audioLevel, stat.audioLevel ?? 0);
        }
      });
      const selected =
        pairs.find((pair) => pair.id === selectedPairId) ??
        pairs.find((pair) => pair.nominated && pair.state === 'succeeded');
      Object.assign(peer.state.diagnostics, {
        bytesSent,
        bytesReceived,
        totalAudioEnergy: energy,
        audioLevel,
        iceGatheringState: pc.iceGatheringState,
        bufferedCandidates: peer.pendingCandidates.length,
        candidatePairs: Math.min(1_000_000, pairs.length),
        succeededPairs: Math.min(
          1_000_000,
          pairs.filter((pair) => pair.state === 'succeeded').length,
        ),
        failedPairs: Math.min(1_000_000, pairs.filter((pair) => pair.state === 'failed').length),
        nominatedPairs: Math.min(1_000_000, pairs.filter((pair) => pair.nominated).length),
        selectedPairState: selected ? pairState(selected.state) : 'none',
        selectedLocalCandidateType: selected
          ? (types.get(selected.localCandidateId) ?? 'unknown')
          : 'none',
        selectedRemoteCandidateType: selected
          ? (types.get(selected.remoteCandidateId) ?? 'unknown')
          : 'none',
      });
      publish();
    } catch {
      /* A connection may close while a stats request is in flight. */
    }
  };
  const startMonitor = () => {
    if (monitor !== null) return;
    monitor = setInterval(() => {
      state.localSpeaking = state.microphoneEnabled && rms(localMeter) > 0.006;
      for (const peer of peers.values()) {
        peer.state.speaking =
          peer.state.enabled &&
          (rms(peer.meter) > 0.006 || peer.state.diagnostics.audioLevel > 0.006);
        if (monitorTicks % 4 === 0) void pollStats(peer);
      }
      monitorTicks++;
      publish();
    }, 250);
  };
  const syncMembership = () => {
    if (disposed) return;
    const network = client.getState(),
      snapshot = network.snapshot;
    const own = snapshot?.room.members.find((member) => member.id === snapshot.memberId);
    if (network.connection !== 'connected' || !snapshot || !own?.connected) {
      if (roomId) cleanupRoom();
      publish();
      return;
    }
    if (roomId !== snapshot.room.id || memberId !== snapshot.memberId) {
      cleanupRoom();
      roomId = snapshot.room.id;
      memberId = snapshot.memberId;
      state = {
        ...emptyVoiceState,
        roomId,
        available: supported,
        error: supported ? null : 'В этом браузере голос недоступен. Партия продолжается без него.',
      };
    }
    const members = snapshot.room.members.filter(
      (member) => member.id !== memberId && member.connected,
    );
    for (const peer of [...peers.values()])
      if (!members.some((member) => member.id === peer.member.id)) closePeer(peer);
    for (const member of members) {
      const existing = peers.get(member.id);
      if (existing) {
        existing.member = member;
        existing.state.name = member.name;
        continue;
      }
      const peer: Peer = {
        member,
        state: {
          memberId: member.id,
          name: member.name,
          enabled: false,
          muted: false,
          volume: 1,
          speaking: false,
          connection: 'waiting',
          error: null,
          playbackBlocked: false,
          diagnostics: emptyDiagnostics(),
        },
        remoteSession: null,
        retiredSessions: new Set(retiredSessionsByMember.get(member.id)),
        generation: null,
        pc: null,
        sender: null,
        audio: null,
        meter: null,
        makingOffer: false,
        settingRemoteAnswer: false,
        ignoreOffer: false,
        pendingCandidates: [],
        remoteUfrags: new Set(),
        retiredUfrags: new Set(),
        ignoredUfrags: new Set(),
        queue: Promise.resolve(),
        alive: true,
      };
      peers.set(member.id, peer);
      if (supported) sendState(peer);
    }
    startMonitor();
    publish();
  };
  const attachLocalStream = async (
    stream: MediaStream,
    source: 'microphone' | 'test-tone',
    newTone: typeof tone = null,
  ) => {
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error('No audio track');
    }
    stopLocalSource();
    tone = newTone;
    localStream = stream;
    localMeter = makeMeter(stream);
    track.enabled = true;
    track.onended = () => {
      if (disposed || localStream !== stream) return;
      state.microphoneEnabled = false;
      state.localSpeaking = false;
      state.error = 'Источник звука отключён. Включите микрофон снова, когда он будет доступен.';
      broadcastState();
      publish();
    };
    state = { ...state, source, microphoneEnabled: true, requestingMicrophone: false, error: null };
    await Promise.all(
      [...peers.values()].map(async (peer) => {
        const sender = peer.sender;
        const pc = peer.pc;
        const generation = peer.generation;
        if (!sender) return;
        try {
          await sender.replaceTrack(track);
        } catch {
          if (
            live(peer) &&
            peer.sender === sender &&
            peer.pc === pc &&
            peer.generation === generation
          )
            peer.state.error = 'Не удалось передать звук этому участнику.';
        }
      }),
    );
    if (!disposed && localStream === stream) {
      broadcastState();
      publish();
    }
  };
  const muteSource = () => {
    requestGeneration++;
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    state = {
      ...state,
      microphoneEnabled: false,
      requestingMicrophone: false,
      localSpeaking: false,
    };
    broadcastState();
    publish();
  };
  const unsubscribeNetwork = client.subscribe(syncMembership);
  const unsubscribeVoice = client.subscribeVoice(receive);
  let unsubscribePageHide = () => {};
  const dispose = () => {
    if (disposed) return;
    unsubscribePageHide();
    unsubscribeNetwork();
    unsubscribeVoice();
    cleanupRoom();
    disposed = true;
    listeners.clear();
  };
  // Browser exit must stop capture synchronously, before a React passive cleanup runs.
  unsubscribePageHide = env.onPageHide?.(dispose) ?? (() => {});
  syncMembership();

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setMicrophoneEnabled: async (enabled) => {
      if (disposed || !roomId || !state.available) return;
      if (!enabled) {
        muteSource();
        return;
      }
      if (
        state.source === 'microphone' &&
        localStream?.getAudioTracks().some((track) => track.readyState === 'live')
      ) {
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        state = { ...state, microphoneEnabled: true, error: null };
        broadcastState();
        publish();
        return;
      }
      if (state.requestingMicrophone) return;
      const request = ++requestGeneration,
        requestedRoom = roomId;
      state = { ...state, requestingMicrophone: true, error: null };
      publish();
      try {
        const stream = await env.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        if (disposed || request !== requestGeneration || requestedRoom !== roomId) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        state.permission = 'granted';
        await attachLocalStream(stream, 'microphone');
      } catch (error) {
        if (disposed || request !== requestGeneration || requestedRoom !== roomId) return;
        state = {
          ...state,
          requestingMicrophone: false,
          permission:
            error instanceof Error && error.name === 'NotAllowedError' ? 'denied' : 'unavailable',
          error: microphoneError(error),
        };
        publish();
      }
    },
    setPeerVolume: (id, volume) => {
      const peer = peers.get(id);
      if (!peer || !Number.isFinite(volume)) return;
      peer.state.volume = Math.max(0, Math.min(1, volume));
      if (peer.audio) peer.audio.volume = peer.state.volume;
      publish();
    },
    setPeerMuted: (id, muted) => {
      const peer = peers.get(id);
      if (!peer) return;
      peer.state.muted = muted;
      if (peer.audio) peer.audio.muted = muted;
      publish();
    },
    setTestToneEnabled: async (enabled) => {
      if (!options.allowTestTone || disposed || !roomId || !state.available) return;
      if (!enabled) {
        if (state.source === 'test-tone') {
          stopLocalSource();
          for (const peer of peers.values()) void peer.sender?.replaceTrack(null).catch(() => {});
          broadcastState();
          publish();
        }
        return;
      }
      if (state.source === 'test-tone' && localStream) {
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        state.microphoneEnabled = true;
        broadcastState();
        publish();
        return;
      }
      const request = ++requestGeneration;
      let context: AudioContext | null = null;
      try {
        context = env.createAudioContext();
        await context.resume();
        if (disposed || request !== requestGeneration || !roomId) {
          await context.close();
          return;
        }
        const oscillator = context.createOscillator(),
          gain = context.createGain(),
          destination = context.createMediaStreamDestination();
        oscillator.frequency.value = 440;
        gain.gain.value = 0.02;
        oscillator.connect(gain);
        gain.connect(destination);
        oscillator.start();
        await attachLocalStream(destination.stream, 'test-tone', { context, oscillator, gain });
      } catch {
        void context?.close().catch(() => {});
        if (!disposed) {
          state.error = 'Тестовый звук недоступен в этом браузере.';
          publish();
        }
      }
    },
    resumePlayback: async () => {
      if (disposed) return;
      try {
        await audioContext?.resume();
      } catch {
        /* Voice remains optional. */
      }
      await Promise.all([...peers.values()].map(tryPlayback));
    },
    dispose,
  };
}
