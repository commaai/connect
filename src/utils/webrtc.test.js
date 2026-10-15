import { WebRTCConnection } from './webrtc';
import { athena } from '../api';
vi.mock('../api', () => ({ athena: { postJsonRpcPayload: vi.fn() } }));
vi.mock('./turn', () => ({ getTurnCredentials: vi.fn().mockResolvedValue(null) }));

function audioConnection() {
  const conn = new WebRTCConnection({});
  conn.audioTransceiver = { currentDirection: 'sendrecv', sender: { replaceTrack: vi.fn().mockResolvedValue() } };
  const track = Object.assign(new EventTarget(), { enabled: true, readyState: 'live', stop: vi.fn() });
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  return { conn, track, stream };
}

afterEach(() => { vi.unstubAllGlobals(); });

it('only enables captured audio while speaking', async () => {
  const { conn, track, stream } = audioConnection();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  await conn.prepareMicrophone();
  expect(track.enabled).toBe(false);
  conn.setSpeaking(true);
  expect(track.enabled).toBe(true);
  conn.setSpeaking(false);
  expect(track.enabled).toBe(false);
  conn.releaseMicrophone();
  expect(track.stop).toHaveBeenCalled();
});

it('stops late microphone permission results after cleanup', async () => {
  const { conn, track, stream } = audioConnection();
  let grant;
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => new Promise((resolve) => { grant = resolve; }) } });
  const request = conn.prepareMicrophone();
  conn.cleanup();
  grant(stream);
  await request;
  expect(track.stop).toHaveBeenCalled();
  expect(track.enabled).toBe(false);
  expect(conn.microphoneStream).toBeNull();
});

it('shares an in-flight permission request', async () => {
  const { conn, stream } = audioConnection();
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  await Promise.all([conn.prepareMicrophone(), conn.prepareMicrophone()]);
  expect(getUserMedia).toHaveBeenCalledTimes(1);
});

it('remembers listening preference until the data channel opens', () => {
  const { conn } = audioConnection();
  conn.videoEnabled = true;
  conn.setListening(false);
  conn.dc = { readyState: 'open', send: vi.fn() };
  conn._sendAudioState();
  expect(JSON.parse(conn.dc.send.mock.calls.at(-1)[0]).data.enabled).toBe(false);
  conn.setListening(true);
  expect(JSON.parse(conn.dc.send.mock.calls.at(-1)[0]).data.enabled).toBe(true);
  conn.enableVideo(false);
  expect(JSON.parse(conn.dc.send.mock.calls.at(-1)[0]).data.enabled).toBe(false);
});

it('reacquires a microphone that ended instead of silently reusing it', async () => {
  const { conn, track, stream } = audioConnection();
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  await conn.prepareMicrophone();
  track.dispatchEvent(new Event('ended'));
  expect(conn.microphoneStream).toBeNull();
  await conn.prepareMicrophone();
  expect(getUserMedia).toHaveBeenCalledTimes(2);
});


it('reattaches an existing microphone if the sender track was replaced', async () => {
  const { conn, track, stream } = audioConnection();
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  await conn.prepareMicrophone();
  conn.audioTransceiver.sender.replaceTrack.mockClear();
  conn.audioTransceiver.sender.track = null;
  await conn.prepareMicrophone();
  expect(conn.audioTransceiver.sender.replaceTrack).toHaveBeenCalledWith(track);
  expect(getUserMedia).toHaveBeenCalledTimes(1);
});

it('rejects speaking after renegotiation loses the sending direction', async () => {
  const { conn, stream } = audioConnection();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  await conn.prepareMicrophone();
  conn.audioTransceiver.currentDirection = 'recvonly';
  await expect(conn.prepareMicrophone()).rejects.toThrow('Two-way audio is unavailable');
});

it('requests echo cancellation without automatic microphone gain', async () => {
  const { conn, stream } = audioConnection();
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  await conn.prepareMicrophone();
  expect(getUserMedia).toHaveBeenCalledWith({ audio: {
    echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1,
  } });
});

it('uses all-playback cancellation when supported and logs actual settings', async () => {
  const { conn, track, stream } = audioConnection();
  track.getCapabilities = () => ({ echoCancellation: [true, false, 'all'] });
  track.applyConstraints = vi.fn().mockResolvedValue();
  track.getSettings = () => ({ echoCancellation: 'all', noiseSuppression: true, autoGainControl: false });
  const log = vi.fn();
  conn.addEventListener('log', log);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  await conn.prepareMicrophone();
  expect(track.applyConstraints).toHaveBeenCalledWith(expect.objectContaining({
    echoCancellation: { exact: 'all' }, autoGainControl: false,
  }));
  expect(log.mock.calls.at(-1)[0].detail.message).toContain('echoCancellation=all');
  expect(track.enabled).toBe(false);
});

it('keeps microphone audio available when the optional cancellation mode is rejected', async () => {
  const { conn, track, stream } = audioConnection();
  track.getCapabilities = () => ({ echoCancellation: [true, false, 'all'] });
  track.applyConstraints = vi.fn().mockRejectedValue(new DOMException('Unsupported', 'OverconstrainedError'));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  await conn.prepareMicrophone();
  expect(conn.audioTransceiver.sender.replaceTrack).toHaveBeenCalledWith(track);
  expect(track.stop).not.toHaveBeenCalled();
});

it('does not attach a microphone after cleanup during cancellation setup', async () => {
  const { conn, track, stream } = audioConnection();
  let finish;
  track.getCapabilities = () => ({ echoCancellation: ['all'] });
  track.applyConstraints = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  const request = conn.prepareMicrophone();
  await vi.waitFor(() => expect(track.applyConstraints).toHaveBeenCalled());
  conn.cleanup();
  finish();
  await request;
  expect(track.stop).toHaveBeenCalled();
  expect(conn.microphoneStream).toBeNull();
});


it.each([['sendrecv', true], ['sendrecv', false], ['recvonly', true], ['inactive', false], [null, false]])('negotiated audio %s with source %s retries video-only only when unsupported', async (direction, hasSource) => {
  const supported = direction === 'sendrecv' && hasSource;
  const peers = [];
  class Peer extends EventTarget {
    constructor() { super(); this.transceivers = []; peers.push(this); }
    addTransceiver(kind) {
      const transceiver = { kind, currentDirection: null, setCodecPreferences: vi.fn(), stop: vi.fn() };
      this.transceivers.push(transceiver);
      return transceiver;
    }
    createDataChannel() { return { close: vi.fn() }; }
    async createOffer() { return { sdp: this.transceivers.map((t) => t.kind).join(' ') }; }
    async setLocalDescription(offer) {
      this.localDescription = offer;
      setTimeout(() => this.dispatchEvent(new Event('icecandidate')), 0);
    }
    async setRemoteDescription() {
      this.transceivers.forEach((t) => { t.currentDirection = t.kind === 'audio' ? direction : 'recvonly'; });
    }
    close() { this.closed = true; }
    getTransceivers() { return this.transceivers; }
  }
  vi.useFakeTimers();
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('RTCRtpReceiver', { getCapabilities: () => ({ codecs: [] }) });
  athena.postJsonRpcPayload.mockReset();
  athena.postJsonRpcPayload.mockResolvedValue({ result: { sdp: `v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=ssrc:123 cname:video\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendrecv\r\n${hasSource ? 'a=ssrc:456 cname:audio\r\n' : ''}` } });
  const conn = new WebRTCConnection({ onConnectionState: vi.fn() });
  try {
    const request = conn.connect('device', true);
    await vi.advanceTimersByTimeAsync(10);
    await request;
    expect(peers).toHaveLength(supported ? 1 : 2);
    expect(athena.postJsonRpcPayload).toHaveBeenCalledTimes(peers.length);
    expect(peers[0].closed ?? false).toBe(!supported);
    expect(peers.at(-1).transceivers.map((t) => t.kind)).toEqual(supported ? ['video', 'audio'] : ['video']);
    expect(conn.audioTransceiver?.currentDirection ?? null).toBe(supported ? direction : null);
    expect(athena.postJsonRpcPayload.mock.calls.at(-1)[1].params.enabled).toBe(true);
  } finally {
    conn.cleanup();
    vi.useRealTimers();
  }
});
