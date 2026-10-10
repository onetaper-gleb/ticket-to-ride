import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkClientApi, NetworkClientState, RoomSnapshot, VoiceSignal } from './protocol';
import { createRoomVoice, type RoomVoice, type VoiceEnvironment } from './voice';

class FakePeer {
  connectionState = 'new';
  signalingState = 'stable';
  iceConnectionState = 'new';
  localDescription: (RTCSessionDescriptionInit & { toJSON(): RTCSessionDescriptionInit }) | null =
    null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onnegotiationneeded: (() => void) | null = null;
  onicecandidate: ((event: { candidate: null }) => void) | null = null;
  ontrack: ((event: { track: MediaStreamTrack; streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onsignalingstatechange: (() => void) | null = null;
  sender = { replaceTrack: vi.fn(async (_track: MediaStreamTrack | null) => {}) };
  addTransceiver = vi.fn(() => ({ sender: this.sender }));
  addIceCandidate = vi.fn(async (_candidate?: RTCIceCandidateInit) => {});
  setLocalDescription = vi.fn(async () => {
    const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer';
    const description: RTCSessionDescriptionInit = { type, sdp: 'v=0\r\na=ice-ufrag:local\r\n' };
    this.localDescription = { ...description, toJSON: () => description };
    this.signalingState = type === 'offer' ? 'have-local-offer' : 'stable';
  });
  setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  });
  close = vi.fn(() => {
    this.connectionState = 'closed';
  });
  getStats = vi.fn(
    async () =>
      new Map([
        [
          'in',
          {
            type: 'inbound-rtp',
            kind: 'audio',
            bytesReceived: 5200,
            totalAudioEnergy: 0.6,
            audioLevel: 0.2,
          },
        ],
        ['out', { type: 'outbound-rtp', kind: 'audio', bytesSent: 4900 }],
      ]),
  );
}
const member = (id: string) => ({
  id,
  name: id,
  seatId: id === 'a' ? 0 : 1,
  connected: true,
  ready: false,
  control: 'human' as const,
  controlEpoch: 0,
  returnPending: false,
});
const snapshot = (self = 'a', others = ['b']): RoomSnapshot => ({
  room: {
    id: 'room-1',
    code: 'ROOM',
    revision: 1,
    hostId: 'a',
    status: 'lobby',
    settings: { seats: 2, difficulty: 'easy', turnSeconds: 90, admissionOpen: true },
    members: [member(self), ...others.map(member)],
    seats: [],
    paused: false,
    pauseReason: null,
  },
  memberId: self,
  authority: null,
  observation: null,
  result: null,
  pendingTurn: null,
  canAct: false,
});
const makeStream = () => {
  const track = {
    kind: 'audio',
    enabled: true,
    readyState: 'live',
    onended: null,
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  return { track, stream };
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function fixture(self = 'a', allowTestTone = false) {
  let current: NetworkClientState = {
    connection: 'connected',
    snapshot: snapshot(self, [self === 'a' ? 'b' : 'a']),
    pendingCommand: null,
    pendingRequest: null,
    error: null,
  };
  const subscribers = new Set<() => void>();
  const voiceSubscribers = new Set<(fromId: string, signal: VoiceSignal) => void>();
  const sent: Array<{ targetId: string; signal: VoiceSignal }> = [];
  const client = {
    getState: () => current,
    subscribe: (listener: () => void) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    subscribeVoice: (listener: (fromId: string, signal: VoiceSignal) => void) => {
      voiceSubscribers.add(listener);
      return () => voiceSubscribers.delete(listener);
    },
    sendVoice: (targetId: string, signal: VoiceSignal) => {
      sent.push({ targetId, signal });
      return true;
    },
  } as unknown as NetworkClientApi;
  const pcs: FakePeer[] = [];
  const audio = {
    srcObject: null,
    volume: 1,
    muted: false,
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    remove: vi.fn(),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const analyser = {
    fftSize: 256,
    disconnect: vi.fn(),
    getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0.1),
  };
  const context = {
    createMediaStreamSource: () => source,
    createAnalyser: () => analyser,
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createOscillator: () => oscillator,
    createGain: () => gain,
    createMediaStreamDestination: () => ({ stream: toneMedia.stream }),
  };
  const oscillator = {
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
  };
  const gain = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const toneMedia = makeStream();
  let sessionNumber = 0;
  const env: VoiceEnvironment = {
    createPeer: vi.fn(() => {
      const pc = new FakePeer();
      pcs.push(pc);
      return pc as unknown as RTCPeerConnection;
    }),
    getUserMedia: vi.fn(async () => makeStream().stream),
    createAudio: () => audio as unknown as HTMLAudioElement,
    createAudioContext: () => context as unknown as AudioContext,
    createStream: (tracks) =>
      ({ getTracks: () => tracks, getAudioTracks: () => tracks }) as unknown as MediaStream,
    sessionId: () => `local-${sessionNumber++}`,
  };
  const voice = createRoomVoice(client, { environment: env, allowTestTone });
  controllers.push(voice);
  const remote = self === 'a' ? 'b' : 'a';
  const receive = (fromId: string, signal: VoiceSignal) => {
    for (const listener of voiceSubscribers) listener(fromId, signal);
  };
  const handshake = () =>
    receive(remote, { type: 'state', enabled: true, generation: 'remote-session' });
  return {
    voice,
    env,
    pcs,
    audio,
    context,
    source,
    analyser,
    oscillator,
    gain,
    toneMedia,
    sent,
    receive,
    handshake,
    remote,
    subscribers,
    voiceSubscribers,
    update: (state: NetworkClientState) => {
      current = state;
      for (const listener of subscribers) listener();
    },
    current: () => current,
  };
}
const controllers: RoomVoice[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  vi.useRealTimers();
});

describe('room voice lifecycle and authenticated signaling', () => {
  it('joins muted without requesting a microphone and ignores identities outside the room', async () => {
    const f = fixture();
    expect(f.env.getUserMedia).not.toHaveBeenCalled();
    expect(f.voice.getState().microphoneEnabled).toBe(false);
    expect(f.sent[0]?.signal).toMatchObject({ type: 'state', enabled: false });
    f.receive('outsider', { type: 'state', enabled: true, generation: 'outsider-session' });
    f.receive('outsider', {
      type: 'description',
      description: { type: 'offer', sdp: 'private' },
      generation: 'fake-pair',
    });
    await flush();
    expect(f.pcs).toHaveLength(0);
    expect(f.voice.getState().peers.map((peer) => peer.memberId)).toEqual(['b']);
    f.handshake();
    expect(f.pcs).toHaveLength(1);
    expect(f.pcs[0]?.addTransceiver).toHaveBeenCalledWith('audio', { direction: 'sendrecv' });
  });

  it('reports refused microphone permission while preserving the room voice session', async () => {
    const f = fixture();
    vi.mocked(f.env.getUserMedia).mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await f.voice.setMicrophoneEnabled(true);
    expect(f.env.getUserMedia).toHaveBeenCalledOnce();
    expect(f.voice.getState()).toMatchObject({
      permission: 'denied',
      microphoneEnabled: false,
      requestingMicrophone: false,
      available: true,
    });
    expect(f.voice.getState().error).toContain('Доступ к микрофону не разрешён');
  });

  it('stops a late permission result after disposal and removes subscriptions and timers', async () => {
    const f = fixture();
    let resolve!: (stream: MediaStream) => void;
    vi.mocked(f.env.getUserMedia).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const enabling = f.voice.setMicrophoneEnabled(true);
    f.voice.dispose();
    const media = makeStream();
    resolve(media.stream);
    await enabling;
    expect(media.track.stop).toHaveBeenCalledOnce();
    expect(f.subscribers.size).toBe(0);
    expect(f.voiceSubscribers.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('mutes the existing track without reopening permission, then stops media on disconnect', async () => {
    const f = fixture();
    f.handshake();
    const media = makeStream();
    vi.mocked(f.env.getUserMedia).mockResolvedValue(media.stream);
    await f.voice.setMicrophoneEnabled(true);
    expect(f.pcs[0]?.sender.replaceTrack).toHaveBeenCalledWith(media.track);
    await f.voice.setMicrophoneEnabled(false);
    expect(media.track.enabled).toBe(false);
    expect(media.track.stop).not.toHaveBeenCalled();
    await f.voice.setMicrophoneEnabled(true);
    expect(media.track.enabled).toBe(true);
    expect(f.env.getUserMedia).toHaveBeenCalledOnce();
    f.update({ ...f.current(), connection: 'reconnecting' });
    expect(media.track.stop).toHaveBeenCalledOnce();
    expect(f.pcs[0]?.close).toHaveBeenCalledOnce();
    expect(f.context.close).toHaveBeenCalledOnce();
    expect(f.voice.getState().microphoneEnabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('buffers candidates until the matching description and rejects retired session generations', async () => {
    const f = fixture();
    f.handshake();
    const oldPc = f.pcs[0]!;
    const generation = f.voice.getState().peers[0]!.diagnostics.generation!;
    const candidate = { candidate: 'candidate:1', usernameFragment: 'remote' };
    f.receive(f.remote, { type: 'candidate', candidate, generation });
    await flush();
    expect(oldPc.addIceCandidate).not.toHaveBeenCalled();
    expect(f.voice.getState().peers[0]?.diagnostics).toMatchObject({
      receivedCandidates: 1,
      appliedCandidates: 0,
    });
    f.receive(f.remote, {
      type: 'description',
      description: { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:remote\r\n' },
      generation,
    });
    await flush();
    expect(oldPc.addIceCandidate).toHaveBeenCalledWith(candidate);
    expect(f.voice.getState().peers[0]?.diagnostics.appliedCandidates).toBe(1);
    f.receive(f.remote, { type: 'state', enabled: false, generation: 'remote-new-session' });
    expect(oldPc.close).toHaveBeenCalledOnce();
    const newPc = f.pcs[1]!;
    f.receive(f.remote, { type: 'candidate', candidate, generation });
    f.receive(f.remote, {
      type: 'description',
      description: { type: 'offer', sdp: '' },
      generation,
    });
    f.receive(f.remote, { type: 'state', enabled: true, generation: 'remote-session' });
    await flush();
    expect(f.pcs).toHaveLength(2);
    expect(newPc.setRemoteDescription).not.toHaveBeenCalled();
    expect(newPc.addIceCandidate).not.toHaveBeenCalled();
  });

  it('does not discard delayed ICE from the accepted generation when a colliding offer is ignored', async () => {
    const f = fixture('a');
    f.handshake();
    const pc = f.pcs[0]!;
    const generation = f.voice.getState().peers[0]!.diagnostics.generation!;
    const description = { type: 'offer' as const, sdp: 'v=0\r\na=ice-ufrag:current\r\n' };
    f.receive(f.remote, { type: 'description', generation, description });
    await flush();
    pc.onnegotiationneeded?.();
    await flush();
    expect(pc.signalingState).toBe('have-local-offer');
    f.receive(f.remote, { type: 'description', generation, description });
    await flush();
    const candidate = {
      candidate: 'candidate:delayed',
      usernameFragment: 'current',
      sdpMid: 'audio',
      sdpMLineIndex: 0,
    };
    f.receive(f.remote, { type: 'candidate', generation, candidate });
    await flush();
    expect(pc.addIceCandidate).toHaveBeenCalledWith(candidate);
    f.receive(f.remote, {
      type: 'description',
      generation,
      description: { ...description, type: 'answer' },
    });
    await flush();
    expect(pc.signalingState).toBe('stable');
    expect(f.voice.getState().peers[0]?.diagnostics.appliedCandidates).toBe(1);
    expect(f.voice.getState().peers[0]?.error).toBeNull();
  });

  it('does not carry an old candidate flush into a replacement remote session', async () => {
    const f = fixture();
    f.handshake();
    const oldPc = f.pcs[0]!;
    const generation = f.voice.getState().peers[0]!.diagnostics.generation!;
    f.receive(f.remote, {
      type: 'candidate',
      generation,
      candidate: { candidate: 'candidate:accepted', usernameFragment: 'current' },
    });
    f.receive(f.remote, {
      type: 'candidate',
      generation,
      candidate: { candidate: 'candidate:future', usernameFragment: 'future' },
    });
    await flush();
    expect(f.voice.getState().peers[0]?.diagnostics.bufferedCandidates).toBe(2);
    let release!: () => void;
    oldPc.addIceCandidate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    f.receive(f.remote, {
      type: 'description',
      generation,
      description: { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:current\r\n' },
    });
    await flush();
    expect(oldPc.addIceCandidate).toHaveBeenCalledOnce();
    f.receive(f.remote, {
      type: 'state',
      generation: 'replacement-remote-session',
      enabled: false,
    });
    expect(f.pcs).toHaveLength(2);
    release();
    await flush();
    expect(f.voice.getState().peers[0]?.diagnostics).toMatchObject({
      bufferedCandidates: 0,
      appliedCandidates: 0,
      appliedDescriptions: 0,
    });
    expect(oldPc.setLocalDescription).not.toHaveBeenCalled();
    expect(f.pcs[1]!.addIceCandidate).not.toHaveBeenCalled();
    const replacement = f.voice.getState().peers[0]!.diagnostics.generation!;
    f.receive(f.remote, {
      type: 'description',
      generation: replacement,
      description: { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:future\r\n' },
    });
    await flush();
    expect(f.pcs[1]!.addIceCandidate).not.toHaveBeenCalled();
    expect(f.pcs[1]!.setLocalDescription).toHaveBeenCalledOnce();
  });

  it('accepts ICE credentials reused by an accepted SDP after an ignored offer', async () => {
    const f = fixture('a');
    f.handshake();
    const pc = f.pcs[0]!;
    const generation = f.voice.getState().peers[0]!.diagnostics.generation!;
    const description = (type: 'offer' | 'answer', fragment: string) => ({
      type,
      sdp: `v=0\r\na=ice-ufrag:${fragment}\r\n`,
    });
    f.receive(f.remote, {
      type: 'description',
      generation,
      description: description('offer', 'current'),
    });
    await flush();
    pc.onnegotiationneeded?.();
    await flush();
    f.receive(f.remote, {
      type: 'description',
      generation,
      description: description('offer', 'future'),
    });
    f.receive(f.remote, {
      type: 'candidate',
      generation,
      candidate: { candidate: 'candidate:ignored-offer', usernameFragment: 'future' },
    });
    await flush();
    expect(f.voice.getState().peers[0]?.diagnostics.bufferedCandidates).toBe(1);
    f.receive(f.remote, {
      type: 'description',
      generation,
      description: description('answer', 'current'),
    });
    await flush();
    expect(f.voice.getState().peers[0]?.diagnostics.bufferedCandidates).toBe(0);
    f.receive(f.remote, {
      type: 'description',
      generation,
      description: description('offer', 'future'),
    });
    const candidate = { candidate: 'candidate:accepted-reuse', usernameFragment: 'future' };
    f.receive(f.remote, { type: 'candidate', generation, candidate });
    await flush();
    expect(pc.addIceCandidate).toHaveBeenCalledWith(candidate);
    expect(f.voice.getState().peers[0]?.error).toBeNull();
  });

  it('reports the selected ICE pair without publishing candidate addresses or credentials', async () => {
    const f = fixture();
    f.handshake();
    f.pcs[0]!.getStats.mockImplementation(
      async () =>
        new Map<string, any>([
          ['transport', { type: 'transport', selectedCandidatePairId: 'pair' }],
          [
            'pair',
            {
              id: 'pair',
              type: 'candidate-pair',
              state: 'succeeded',
              nominated: true,
              localCandidateId: 'local',
              remoteCandidateId: 'remote',
            },
          ],
          [
            'local',
            {
              id: 'local',
              type: 'local-candidate',
              candidateType: 'host',
              address: '192.0.2.1',
              port: 1234,
              password: 'private-ice-password',
            },
          ],
          [
            'remote',
            {
              id: 'remote',
              type: 'remote-candidate',
              candidateType: 'relay',
              address: '192.0.2.2',
              port: 5678,
              username: 'private-ice-user',
            },
          ],
        ]),
    );
    vi.advanceTimersByTime(1000);
    await flush();
    const diagnostics = f.voice.getState().peers[0]!.diagnostics;
    expect(diagnostics).toMatchObject({
      candidatePairs: 1,
      succeededPairs: 1,
      nominatedPairs: 1,
      selectedPairState: 'succeeded',
      selectedLocalCandidateType: 'host',
      selectedRemoteCandidateType: 'relay',
    });
    expect(JSON.stringify(diagnostics)).not.toMatch(
      /192\.0\.2|1234|5678|private-ice|password|username/,
    );
  });

  it.each(['a', 'b'])(
    'resolves simultaneous offers deterministically for member %s',
    async (self) => {
      const f = fixture(self);
      f.handshake();
      const pc = f.pcs[0]!;
      pc.onnegotiationneeded?.();
      await flush();
      const generation = f.voice.getState().peers[0]!.diagnostics.generation!;
      f.receive(f.remote, {
        type: 'description',
        description: { type: 'offer', sdp: 'a=ice-ufrag:remote\r\n' },
        generation,
      });
      await flush();
      if (self === 'a') expect(pc.setRemoteDescription).not.toHaveBeenCalled();
      else {
        expect(pc.setRemoteDescription).toHaveBeenCalledOnce();
        expect(
          f.sent.some(
            ({ signal }) => signal.type === 'description' && signal.description.type === 'answer',
          ),
        ).toBe(true);
      }
    },
  );

  it('applies per-peer listening controls, reports stats, and cleans remote audio when kicked', async () => {
    const f = fixture();
    f.handshake();
    const remoteMedia = makeStream();
    f.pcs[0]!.ontrack?.({ track: remoteMedia.track, streams: [remoteMedia.stream] });
    f.voice.setPeerVolume(f.remote, 0.25);
    f.voice.setPeerMuted(f.remote, true);
    expect(f.audio.volume).toBe(0.25);
    expect(f.audio.muted).toBe(true);
    vi.advanceTimersByTime(1000);
    await flush();
    expect(f.voice.getState().peers[0]?.diagnostics).toMatchObject({
      bytesSent: 4900,
      bytesReceived: 5200,
      totalAudioEnergy: 0.6,
    });
    f.update({ ...f.current(), connection: 'kicked', snapshot: null });
    expect(f.audio.pause).toHaveBeenCalledOnce();
    expect(f.audio.srcObject).toBeNull();
    expect(remoteMedia.track.stop).toHaveBeenCalledOnce();
    expect(f.pcs[0]?.onicecandidate).toBeNull();
    expect(f.pcs[0]?.ontrack).toBeNull();
    expect(f.voice.getState().peers).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not enable a test tone unless the QA option was explicitly provided', async () => {
    const f = fixture();
    await f.voice.setTestToneEnabled(true);
    expect(f.env.getUserMedia).not.toHaveBeenCalled();
    expect(f.voice.getState().source).toBe('none');
  });

  it('stops the explicitly enabled QA oscillator and track when its button is turned off', async () => {
    const f = fixture('a', true);
    await f.voice.setTestToneEnabled(true);
    expect(f.env.getUserMedia).not.toHaveBeenCalled();
    expect(f.voice.getState()).toMatchObject({ source: 'test-tone', microphoneEnabled: true });
    expect(f.oscillator.frequency.value).toBe(440);
    expect(f.gain.gain.value).toBe(0.02);
    expect(f.oscillator.start).toHaveBeenCalledOnce();
    await f.voice.setTestToneEnabled(false);
    expect(f.oscillator.stop).toHaveBeenCalledOnce();
    expect(f.toneMedia.track.stop).toHaveBeenCalledOnce();
    expect(f.voice.getState()).toMatchObject({ source: 'none', microphoneEnabled: false });
  });

  it('cleans a test oscillator even if disposal races a pending sender replacement', async () => {
    const f = fixture('a', true);
    f.handshake();
    let resolve!: () => void;
    f.pcs[0]!.sender.replaceTrack.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const enabling = f.voice.setTestToneEnabled(true);
    await flush();
    f.voice.dispose();
    expect(f.oscillator.stop).toHaveBeenCalledOnce();
    expect(f.toneMedia.track.stop).toHaveBeenCalledOnce();
    resolve();
    await enabling;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('remembers retired voice sessions when the same room member disconnects and rejoins', () => {
    const f = fixture();
    f.handshake();
    const current = f.current();
    const left = snapshot();
    left.room.members[1]!.connected = false;
    f.update({ ...current, snapshot: left });
    expect(f.pcs[0]?.close).toHaveBeenCalledOnce();
    f.update(current);
    f.receive(f.remote, { type: 'state', enabled: true, generation: 'remote-session' });
    expect(f.pcs).toHaveLength(1);
    f.receive(f.remote, { type: 'state', enabled: false, generation: 'rejoined-session' });
    expect(f.pcs).toHaveLength(2);
  });
  it('ignores a late sender failure after the remote voice session was replaced', async () => {
    const f = fixture();
    f.handshake();
    let reject!: (error: Error) => void;
    f.pcs[0]!.sender.replaceTrack.mockImplementation(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const enabling = f.voice.setMicrophoneEnabled(true);
    await flush();
    f.receive(f.remote, { type: 'state', enabled: true, generation: 'remote-new-session' });
    expect(f.pcs).toHaveLength(2);
    f.pcs[1]!.connectionState = 'connected';
    f.pcs[1]!.onconnectionstatechange?.();
    reject(new Error('Old sender closed'));
    await enabling;
    expect(f.voice.getState().peers[0]).toMatchObject({ connection: 'connected', error: null });
    expect(f.voice.getState().microphoneEnabled).toBe(true);
    f.voice.dispose();
  });
});
