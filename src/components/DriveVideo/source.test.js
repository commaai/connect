import { loadVideoSource } from './source';
import Hls from 'hls.js';

const instances = vi.hoisted(() => []);
vi.mock('hls.js', () => ({ default: class {
  static isSupported = () => true;
  static Events = { BUFFER_CODECS: 'codecs', ERROR: 'error' };
  static ErrorTypes = { MEDIA_ERROR: 'media', NETWORK_ERROR: 'network' };
  constructor() { this.listeners = {}; instances.push(this); }
  on(event, listener) { this.listeners[event] = listener; }
  emit(event, data) { this.listeners[event](event, data); }
  attachMedia = vi.fn();
  loadSource = vi.fn();
  recoverMediaError = vi.fn();
  destroy = vi.fn();
} }));
let video;
let callbacks;
let cleanup;
const flushImport = () => vi.waitFor(() => expect(instances).toHaveLength(1));
beforeEach(() => {
  instances.length = 0;
  video = Object.assign(new EventTarget(), { canPlayType: () => 'maybe',
    audioTracks: Object.assign(new EventTarget(), { length: 0 }),
    load: vi.fn(), removeAttribute: vi.fn() });
  callbacks = { onAudio: vi.fn(), onError: vi.fn() };
});
afterEach(() => cleanup?.());

it('detects native audio after metadata and track changes', () => {
  cleanup = loadVideoSource(video, 'native.m3u8', callbacks);
  expect(callbacks.onAudio).toHaveBeenLastCalledWith(null);
  video.audioTracks.length = 1;
  video.dispatchEvent(new Event('loadedmetadata'));
  expect(callbacks.onAudio).toHaveBeenLastCalledWith(true);
  video.audioTracks.length = 0;
  video.audioTracks.dispatchEvent(new Event('removetrack'));
  expect(callbacks.onAudio).toHaveBeenLastCalledWith(false);
});

it('falls back when native HLS reports support but rejects the stream', async () => {
  cleanup = loadVideoSource(video, 'native.m3u8', callbacks);
  video.error = { code: 4 };
  video.dispatchEvent(new Event('error'));
  await flushImport();
  expect(instances[0].loadSource).toHaveBeenCalledWith('native.m3u8');
  instances[0].emit(Hls.Events.BUFFER_CODECS, { audio: {} });
  video.dispatchEvent(new Event('canplay'));
  expect(callbacks.onAudio).toHaveBeenLastCalledWith(true);
  expect(callbacks.onError).not.toHaveBeenCalled();
});

it('recovers a decode error once and treats fatal network errors as retryable failures', async () => {
  video.canPlayType = () => '';
  cleanup = loadVideoSource(video, 'fallback.m3u8', callbacks);
  await flushImport();
  const hls = instances[0];
  hls.emit(Hls.Events.ERROR, { fatal: false, type: 'network' });
  expect(callbacks.onError).not.toHaveBeenCalled();
  hls.emit(Hls.Events.ERROR, { fatal: true, type: 'media' });
  expect(hls.recoverMediaError).toHaveBeenCalledOnce();
  hls.emit(Hls.Events.ERROR, { fatal: true, type: 'media' });
  expect(callbacks.onError).toHaveBeenLastCalledWith('Unable to play this video.');
  hls.emit(Hls.Events.ERROR, { fatal: true, type: 'network', response: { code: 503 } });
  expect(hls.recoverMediaError).toHaveBeenCalledOnce();
  expect(callbacks.onError).toHaveBeenLastCalledWith(expect.stringContaining('connection'));
  hls.emit(Hls.Events.ERROR, { fatal: true, type: 'network', response: { code: 404 } });
  expect(callbacks.onError).toHaveBeenLastCalledWith(expect.stringContaining('deleted'));
});

it('ignores source callbacks and import completion after cleanup', async () => {
  video.canPlayType = () => '';
  cleanup = loadVideoSource(video, 'fallback.m3u8', callbacks);
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(instances).toHaveLength(0);
  expect(callbacks.onError).not.toHaveBeenCalled();
  video.dispatchEvent(new Event('loadedmetadata'));
  expect(callbacks.onAudio).toHaveBeenCalledOnce();
});
