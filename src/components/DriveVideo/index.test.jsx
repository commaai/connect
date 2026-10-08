import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouteVideo } from '.';
import { bufferVideo, pause, play, videoTime } from '../../timeline/playback';

const mocks = vi.hoisted(() => ({ instances: [], attachClock: vi.fn(), subscribeFrames: vi.fn(), supported: true, supportChecks: vi.fn() }));

vi.mock('../../timeline', () => ({ attachPlaybackClock: mocks.attachClock, subscribePlaybackFrames: mocks.subscribeFrames }));
vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: vi.fn() } } }));
vi.mock('hls.js', () => ({
  default: class {
    static isSupported() { mocks.supportChecks(); return mocks.supported; }
    static Events = { BUFFER_CODECS: 'codecs', ERROR: 'error', MEDIA_DETACHING: 'detaching' };
    static ErrorTypes = { MEDIA_ERROR: 'media', NETWORK_ERROR: 'network' };
    handlers = {};
    constructor(config) { this.config = config; mocks.instances.push(this); }
    on = vi.fn((event, callback) => { this.handlers[event] = callback; });
    attachMedia = vi.fn();
    loadSource = vi.fn();
    recoverMediaError = vi.fn();
    stopLoad = vi.fn();
    destroy = vi.fn();
    emit(event, data) { act(() => this.handlers[event](event, data)); }
  },
}));

const ROUTE = 'demo|2026-08-06--12-00-00';
let media;
let nativeHls;
let audioTracks;
let playVideo;
let pauseVideo;
let loadVideo;

function state(video) {
  if (!media.has(video)) media.set(video, {
    currentTime: 0, duration: 60, readyState: 0, paused: true, seeking: false, ended: false,
    playbackRate: 1, rates: [], seeks: [], error: null,
  });
  return media.get(video);
}

function renderPlayer(overrides = {}) {
  let props = {
    src: 'https://video.example/route.m3u8',
    currentRoute: { fullname: ROUTE, videoStartOffset: 5000 },
    seekRequest: { id: 1, offset: 5000 }, offset: null,
    desiredPlaySpeed: 1, isBufferingVideo: true, isMuted: true,
    dispatch: vi.fn(), onAudioStatusChange: vi.fn(), ...overrides,
  };
  const view = render(<RouteVideo {...props} />);
  const video = screen.getByLabelText('Drive video');
  return {
    ...view, video, dispatch: props.dispatch, onAudioStatusChange: props.onAudioStatusChange,
    update(next) { props = { ...props, ...next }; view.rerender(<RouteVideo {...props} />); },
  };
}

function ready(video, values = {}) {
  Object.assign(state(video), { readyState: 4, ...values });
  fireEvent.canPlay(video);
}

async function hlsInstance(index = 0) {
  await waitFor(() => expect(mocks.instances).toHaveLength(index + 1));
  return mocks.instances[index];
}

beforeEach(() => {
  media = new WeakMap();
  nativeHls = false;
  audioTracks = undefined;
  mocks.instances.length = 0;
  mocks.supported = true;
  mocks.supportChecks.mockReset();
  mocks.attachClock.mockReset().mockImplementation(() => vi.fn());
  mocks.subscribeFrames.mockReset().mockImplementation(() => vi.fn());
  const prototype = HTMLMediaElement.prototype;
  for (const property of ['currentTime', 'duration', 'readyState', 'paused', 'seeking', 'ended']) {
    vi.spyOn(prototype, property, 'get').mockImplementation(function () { return state(this)[property]; });
  }
  vi.spyOn(prototype, 'currentTime', 'set').mockImplementation(function (value) {
    state(this).currentTime = value;
    state(this).seeks.push(value);
    state(this).seeking = true;
  });
  vi.spyOn(prototype, 'playbackRate', 'get').mockImplementation(function () { return state(this).playbackRate; });
  vi.spyOn(prototype, 'playbackRate', 'set').mockImplementation(function (value) {
    state(this).playbackRate = value;
    state(this).rates.push(value);
  });
  vi.spyOn(prototype, 'canPlayType').mockImplementation(() => nativeHls ? 'probably' : '');
  vi.spyOn(prototype, 'audioTracks', 'get').mockImplementation(() => audioTracks);
  playVideo = vi.spyOn(prototype, 'play').mockImplementation(function () {
    state(this).paused = false;
    return Promise.resolve();
  });
  pauseVideo = vi.spyOn(prototype, 'pause').mockImplementation(function () { state(this).paused = true; });
  loadVideo = vi.spyOn(prototype, 'load').mockImplementation(function () {
    Object.assign(state(this), { currentTime: 0, readyState: 0, seeking: false });
  });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete HTMLVideoElement.prototype.requestVideoFrameCallback;
  delete HTMLVideoElement.prototype.cancelVideoFrameCallback;
});

describe('route video playback', () => {
  it('reports route milliseconds from video events and supplies its live clock', async () => {
    const { video, dispatch } = renderPlayer();
    await hlsInstance();
    ready(video);
    dispatch.mockClear();
    state(video).currentTime = 12.345;
    fireEvent.timeUpdate(video);
    expect(dispatch).toHaveBeenLastCalledWith(videoTime(ROUTE, 17345));
    const [route, readOffset] = mocks.attachClock.mock.calls[0];
    expect(route).toBe(ROUTE);
    state(video).currentTime = 12.5;
    expect(readOffset()).toBe(17500);
  });

  it('keeps only the latest seek before metadata and reports after it settles', async () => {
    const app = renderPlayer({ offset: 7000 });
    await hlsInstance();
    app.update({ seekRequest: { id: 2, offset: 16000 } });
    app.update({ seekRequest: { id: 3, offset: 27000 } });
    expect(state(app.video).seeks).toEqual([]);
    app.dispatch.mockClear();
    ready(app.video);
    expect(state(app.video).seeks).toEqual([22]);
    fireEvent.timeUpdate(app.video);
    expect(app.dispatch).not.toHaveBeenCalledWith(videoTime(ROUTE, 27000));
    expect(mocks.attachClock.mock.calls[0][1]()).toBe(7000);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(videoTime(ROUTE, 27000));
  });

  it.each([['detaching', false], ['detaching', true], ['error', false], ['error', true]])(
    'keeps a cold range target through %s recovery (metadata ready: %s)', async (event, metadataReady) => {
      const app = renderPlayer({ offset: null, seekRequest: { id: 1, offset: 27000 } });
      const hls = await hlsInstance();
      expect(hls.config.startPosition).toBe(22);
      if (metadataReady) ready(app.video);
      hls.emit(event, event === 'error' ? { fatal: true, type: 'media' } : {});
      Object.assign(state(app.video), { currentTime: 0, readyState: 0, seeking: false, paused: true });
      fireEvent.pause(app.video);
      app.dispatch.mockClear();
      ready(app.video);
      expect(app.video.currentTime).toBe(22);
      state(app.video).seeking = false;
      fireEvent.seeked(app.video);
      expect(app.dispatch).toHaveBeenCalledWith(videoTime(ROUTE, 27000));
    },
  );

  it('remaps an unfinished seek when first-camera timing arrives', async () => {
    const app = renderPlayer({ offset: 7000, desiredPlaySpeed: 0 });
    await hlsInstance();
    ready(app.video);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    app.update({ seekRequest: { id: 2, offset: 27000 } });
    expect(app.video.currentTime).toBe(22);
    app.update({ currentRoute: { fullname: ROUTE, videoStartOffset: 8000 } });
    expect(app.video.currentTime).toBe(19);
    app.dispatch.mockClear();
    fireEvent.timeUpdate(app.video);
    expect(app.dispatch).not.toHaveBeenCalledWith(videoTime(ROUTE, 27000));
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(videoTime(ROUTE, 27000));
  });

  it('publishes settled paused media after a timing update without seeking again', () => {
    nativeHls = true;
    const app = renderPlayer({ desiredPlaySpeed: 0, offset: 15000, seekRequest: { id: 1, offset: 15000 } });
    ready(app.video);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    app.dispatch.mockClear();
    app.update({ currentRoute: { fullname: ROUTE, videoStartOffset: 8000 } });
    expect(app.dispatch).toHaveBeenCalledWith(videoTime(ROUTE, 18000));
    expect(mocks.attachClock.mock.calls[0][1]()).toBe(18000);
    expect(app.video.currentTime).toBe(10);
    expect(state(app.video).seeks).toEqual([10]);
    expect(loadVideo).toHaveBeenCalledOnce();
    expect(playVideo).not.toHaveBeenCalled();
  });

  it('continues reporting after seeking to the current position while paused', () => {
    nativeHls = true;
    const app = renderPlayer({ desiredPlaySpeed: 0, offset: 17125, seekRequest: { id: 1, offset: 17125 } });
    ready(app.video);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    app.update({ seekRequest: { id: 2, offset: 17125 } });
    expect(state(app.video).seeks).toEqual([12.125]);
    app.update({ desiredPlaySpeed: 1 });
    app.dispatch.mockClear();
    state(app.video).currentTime = 12.4;
    fireEvent.timeUpdate(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(videoTime(ROUTE, 17400));
    expect(mocks.attachClock.mock.calls[0][1]()).toBe(17400);
  });

  it('uses only the requested speed through buffering and honors pause commands', async () => {
    const app = renderPlayer({ desiredPlaySpeed: 1.5, isBufferingVideo: false });
    await hlsInstance();
    ready(app.video);
    fireEvent.waiting(app.video);
    fireEvent.playing(app.video);
    state(app.video).currentTime = 20;
    fireEvent.timeUpdate(app.video);
    expect(state(app.video).rates.every(rate => rate === 1.5)).toBe(true);
    expect(app.dispatch).toHaveBeenCalledWith(bufferVideo(true));
    pauseVideo.mockClear();
    app.update({ desiredPlaySpeed: 0 });
    expect(pauseVideo).toHaveBeenCalledOnce();
    expect(app.video.paused).toBe(true);
    app.update({ desiredPlaySpeed: 0.5 });
    expect(app.video.playbackRate).toBe(0.5);
  });

  it.each(['waiting', 'stalled'])('reports %s to the shared scheduler without creating a second frame loop', (event) => {
    nativeHls = true;
    delete HTMLVideoElement.prototype.requestVideoFrameCallback;
    delete HTMLVideoElement.prototype.cancelVideoFrameCallback;
    const app = renderPlayer({ isBufferingVideo: false });
    ready(app.video);
    fireEvent.playing(app.video);
    expect(mocks.subscribeFrames).toHaveBeenCalledOnce();
    state(app.video).readyState = 2;
    fireEvent(app.video, new Event(event));
    expect(app.dispatch).toHaveBeenCalledWith(bufferVideo(true));
    app.update({ isBufferingVideo: true });
    state(app.video).readyState = 4;
    fireEvent.playing(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(bufferVideo(false));
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    app.unmount();
    expect(mocks.subscribeFrames.mock.results[0].value).toHaveBeenCalledOnce();
  });

  it('loads native HLS inline and clears buffering on canplay while paused', () => {
    nativeHls = true;
    const app = renderPlayer({ desiredPlaySpeed: 0 });
    expect(app.video).toHaveAttribute('src', 'https://video.example/route.m3u8');
    expect(app.video).toHaveAttribute('playsinline');
    expect(loadVideo).toHaveBeenCalledOnce();
    expect(mocks.instances).toHaveLength(0);
    ready(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(bufferVideo(false));
    expect(playVideo).not.toHaveBeenCalled();
  });

  it.each([false, true])('falls back from an unsupported native source without losing a cold range (metadata ready: %s)', async (metadataReady) => {
    nativeHls = true;
    const app = renderPlayer({ offset: null, seekRequest: { id: 1, offset: 27000 } });
    if (metadataReady) ready(app.video);
    app.dispatch.mockClear();
    Object.defineProperty(app.video, 'error', { configurable: true, value: { code: 4 } });
    fireEvent.error(app.video);
    const hls = await hlsInstance();
    expect(screen.getByLabelText('Drive video')).toBe(app.video);
    expect(hls.config.startPosition).toBe(22);
    expect(hls.attachMedia).toHaveBeenCalledWith(app.video);
    expect(hls.loadSource).toHaveBeenCalledWith('https://video.example/route.m3u8');
    state(app.video).paused = true;
    fireEvent.pause(app.video);
    expect(app.dispatch).not.toHaveBeenCalledWith(pause());
    hls.emit('codecs', { audio: { codec: 'mp4a.40.2' } });
    ready(app.video);
    expect(app.video.currentTime).toBe(22);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(videoTime(ROUTE, 27000));
    expect(app.onAudioStatusChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses MSE after native play rejects with NotSupportedError', async () => {
    nativeHls = true;
    playVideo.mockRejectedValueOnce(new DOMException('Native format unsupported', 'NotSupportedError'));
    const app = renderPlayer({ seekRequest: { id: 1, offset: 27000 } });
    const hls = await hlsInstance();
    expect(hls.config.startPosition).toBe(22);
    expect(app.dispatch).not.toHaveBeenCalledWith(pause());
    ready(app.video);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    expect(app.video.paused).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains native source incompatibility when MSE is unavailable', async () => {
    nativeHls = true;
    mocks.supported = false;
    const app = renderPlayer();
    Object.defineProperty(app.video, 'error', { configurable: true, value: { code: 4 } });
    fireEvent.error(app.video);
    expect(await screen.findByRole('alert')).toHaveTextContent(/browser|support/i);
    expect(app.dispatch).toHaveBeenCalledWith(pause());
    expect(app.dispatch).toHaveBeenCalledWith(bufferVideo(false));
    expect(mocks.instances).toHaveLength(0);
    expect(mocks.supportChecks).toHaveBeenCalledOnce();
  });

  it('does not restart fallback for duplicate native error callbacks', async () => {
    nativeHls = true;
    const app = renderPlayer();
    Object.defineProperty(app.video, 'error', { configurable: true, value: { code: 4 } });
    fireEvent.error(app.video);
    fireEvent.error(app.video);
    fireEvent.error(app.video);
    const hls = await hlsInstance();
    const supportChecks = mocks.supportChecks.mock.calls.length;
    expect(supportChecks).toBeLessThanOrEqual(2);
    fireEvent.error(app.video);
    await act(async () => {});
    expect(mocks.instances).toHaveLength(1);
    expect(mocks.supportChecks).toHaveBeenCalledTimes(supportChecks);
    expect(hls.loadSource).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores a queued native error while the MSE transport is initializing', async () => {
    nativeHls = true;
    const app = renderPlayer();
    const queuedError = vi.fn(() => fireEvent.error(app.video));
    mocks.supportChecks.mockImplementationOnce(() => {}).mockImplementationOnce(queuedError);
    Object.defineProperty(app.video, 'error', { configurable: true, value: { code: 4 } });
    app.dispatch.mockClear();
    fireEvent.error(app.video);
    await hlsInstance();
    expect(queuedError).toHaveBeenCalledOnce();
    ready(app.video);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(app.dispatch).not.toHaveBeenCalledWith(pause());
    expect(app.video.paused).toBe(false);
  });

  it('ignores a cleared native error queued before a source reload', () => {
    nativeHls = true;
    const app = renderPlayer({ offset: 23000, seekRequest: { id: 1, offset: 23000 } });
    ready(app.video);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    Object.defineProperty(app.video, 'error', { configurable: true, value: null });
    app.update({ src: 'https://video.example/route.m3u8?share_sig=refreshed' });
    app.dispatch.mockClear();
    fireEvent.error(app.video);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(app.dispatch).not.toHaveBeenCalledWith(pause());
    expect(mocks.instances).toHaveLength(0);
    ready(app.video);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(videoTime(ROUTE, 23000));
    expect(app.video.paused).toBe(false);
  });

  it('does not try to play an unattached HLS source before it is ready', async () => {
    playVideo.mockImplementation(function () {
      return state(this).readyState ? Promise.resolve() : Promise.reject(new DOMException('No source', 'NotSupportedError'));
    });
    const app = renderPlayer();
    await hlsInstance();
    expect(playVideo).not.toHaveBeenCalled();
    ready(app.video);
    await waitFor(() => expect(playVideo).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retains HLS audio status when native audioTracks is unavailable', async () => {
    const app = renderPlayer();
    const hls = await hlsInstance();
    hls.emit('codecs', { audio: { codec: 'mp4a.40.2' } });
    ready(app.video);
    expect(app.onAudioStatusChange).toHaveBeenLastCalledWith(true);
  });

  it('detects native audio after decoding starts without an audioTracks API', () => {
    nativeHls = true;
    const app = renderPlayer();
    Object.defineProperty(app.video, 'webkitAudioDecodedByteCount', { configurable: true, writable: true, value: 0 });
    ready(app.video);
    expect(app.onAudioStatusChange).not.toHaveBeenCalledWith(true);
    app.video.webkitAudioDecodedByteCount = 2048;
    fireEvent.timeUpdate(app.video);
    expect(app.onAudioStatusChange).toHaveBeenLastCalledWith(true);
  });

  it('does not report audio for a silent native stream', () => {
    nativeHls = true;
    const app = renderPlayer();
    Object.defineProperty(app.video, 'webkitAudioDecodedByteCount', { configurable: true, value: 0 });
    ready(app.video);
    state(app.video).currentTime = 3;
    fireEvent.timeUpdate(app.video);
    fireEvent.playing(app.video);
    expect(app.onAudioStatusChange).not.toHaveBeenCalledWith(true);
  });

  it('detects Safari audio track arrivals and removes the track listener', () => {
    nativeHls = true;
    audioTracks = Object.assign(new EventTarget(), { length: 0 });
    const app = renderPlayer();
    ready(app.video);
    audioTracks.length = 1;
    act(() => audioTracks.dispatchEvent(new Event('addtrack')));
    expect(app.onAudioStatusChange).toHaveBeenLastCalledWith(true);
    app.unmount();
    app.onAudioStatusChange.mockClear();
    audioTracks.length = 0;
    act(() => audioTracks.dispatchEvent(new Event('addtrack')));
    expect(app.onAudioStatusChange).not.toHaveBeenCalled();
  });

  it('leaves recoverable HLS errors to the transport', async () => {
    const app = renderPlayer();
    const hls = await hlsInstance();
    app.dispatch.mockClear();
    hls.emit('error', { fatal: false, type: 'network', response: { code: 503 } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(hls.stopLoad).not.toHaveBeenCalled();
    expect(app.dispatch).not.toHaveBeenCalled();
  });

  it('offers retry for an unavailable fragment before transport retries leave a spinner', async () => {
    const app = renderPlayer();
    const hls = await hlsInstance();
    hls.emit('error', { fatal: false, type: 'network', response: { code: 404 } });
    expect(hls.stopLoad).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('has not uploaded yet or has been deleted');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(app.dispatch).toHaveBeenCalledWith(bufferVideo(false));
    expect(app.dispatch).toHaveBeenCalledWith(pause());
  });

  it('recovers a fatal media error once before offering a clean retry', async () => {
    renderPlayer();
    const hls = await hlsInstance();
    hls.emit('error', { fatal: true, type: 'media' });
    expect(hls.recoverMediaError).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    hls.emit('error', { fatal: true, type: 'media' });
    expect(hls.recoverMediaError).toHaveBeenCalledOnce();
    expect(hls.stopLoad).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('retains a terminal error when an old canplay event arrives', async () => {
    const app = renderPlayer({ desiredPlaySpeed: 0 });
    const hls = await hlsInstance();
    ready(app.video);
    hls.emit('error', { fatal: true, type: 'network', response: { code: 404 } });
    fireEvent.canPlay(app.video);
    expect(screen.getByRole('alert')).toHaveTextContent('has not uploaded yet or has been deleted');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('preserves position and playback through a media recovery detach', async () => {
    const app = renderPlayer({ offset: 15000, seekRequest: { id: 1, offset: 15000 } });
    const hls = await hlsInstance();
    ready(app.video);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    await act(async () => {});
    hls.recoverMediaError.mockImplementation(() => {
      Object.assign(state(app.video), { currentTime: 0, readyState: 0, paused: true });
      fireEvent.pause(app.video);
    });
    app.dispatch.mockClear();
    playVideo.mockClear();
    Object.defineProperty(app.video, 'error', { configurable: true, value: { code: 3 } });
    fireEvent.error(app.video);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    hls.emit('error', { fatal: true, type: 'media' });
    expect(app.dispatch).not.toHaveBeenCalledWith(pause());
    ready(app.video);
    expect(app.video.currentTime).toBe(10);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(videoTime(ROUTE, 15000));
    expect(playVideo).toHaveBeenCalled();
  });

  it('retains play intent and position when HLS automatically detaches media', async () => {
    const app = renderPlayer({ offset: 15000, seekRequest: { id: 1, offset: 15000 }, isBufferingVideo: false });
    const hls = await hlsInstance();
    ready(app.video);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    await act(async () => {});
    app.dispatch.mockClear();
    playVideo.mockClear();
    hls.emit('detaching', {});
    Object.assign(state(app.video), { currentTime: 0, readyState: 0, paused: true });
    fireEvent.pause(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(bufferVideo(true));
    expect(app.dispatch).not.toHaveBeenCalledWith(pause());
    ready(app.video);
    expect(app.video.currentTime).toBe(10);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(videoTime(ROUTE, 15000));
    expect(playVideo).toHaveBeenCalled();
  });

  it('keeps the observed position and play intent when a signed source refreshes', async () => {
    const app = renderPlayer({ offset: 23000, seekRequest: { id: 1, offset: 23000 } });
    const first = await hlsInstance();
    ready(app.video);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    state(app.video).currentTime = 21;
    app.update({ offset: 26000 });
    app.update({ src: 'https://video.example/route.m3u8?share_sig=refreshed' });
    const second = await hlsInstance(1);
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(second.config.startPosition).toBe(21);
    app.dispatch.mockClear();
    state(app.video).paused = true;
    fireEvent.pause(app.video);
    expect(app.dispatch).not.toHaveBeenCalledWith(pause());
    ready(app.video);
    expect(app.video.currentTime).toBe(21);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(videoTime(ROUTE, 26000));
    expect(app.video.paused).toBe(false);
  });

  it('explains missing segments and retries at the last observed position', async () => {
    const app = renderPlayer({ offset: 23000, seekRequest: { id: 1, offset: 23000 } });
    const first = await hlsInstance();
    ready(app.video);
    state(app.video).seeking = false;
    first.emit('error', { fatal: true, type: 'network', response: { code: 404 } });
    expect(screen.getByRole('alert')).toHaveTextContent('has not uploaded yet or has been deleted');
    expect(app.dispatch).toHaveBeenCalledWith(pause());
    app.update({ desiredPlaySpeed: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const second = await hlsInstance(1);
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(second.loadSource).toHaveBeenCalledWith('https://video.example/route.m3u8');
    expect(second.config.startPosition).toBe(18);
    ready(app.video);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(videoTime(ROUTE, 23000));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps an unfinished seek across a failed load and retry', async () => {
    const app = renderPlayer({ offset: 7000 });
    const first = await hlsInstance();
    app.update({ seekRequest: { id: 2, offset: 27000 } });
    first.emit('error', { fatal: true, type: 'network' });
    app.update({ desiredPlaySpeed: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const second = await hlsInstance(1);
    expect(second.config.startPosition).toBe(22);
    ready(app.video);
    expect(app.video.currentTime).toBe(22);
    state(app.video).seeking = false;
    fireEvent.seeked(app.video);
    expect(app.dispatch).toHaveBeenCalledWith(videoTime(ROUTE, 27000));
  });

  it('wraps a range beginning at zero from the video frame clock', async () => {
    const app = renderPlayer({
      currentRoute: { fullname: ROUTE, videoStartOffset: 0 },
      seekRequest: { id: 1, offset: 0 }, loop: { startTime: 0, duration: 10000 },
    });
    await hlsInstance();
    ready(app.video);
    fireEvent.playing(app.video);
    app.dispatch.mockClear();
    state(app.video).currentTime = 10;
    act(() => mocks.subscribeFrames.mock.calls[0][0]());
    expect(state(app.video).seeks).toEqual([0]);
    expect(app.dispatch).not.toHaveBeenCalledWith(videoTime(ROUTE, 10000));
  });

  it('offers user playback after an autoplay rejection', async () => {
    playVideo.mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError'));
    const app = renderPlayer();
    await hlsInstance();
    ready(app.video);
    const button = await screen.findByRole('button', { name: 'Play video' });
    expect(app.dispatch).toHaveBeenCalledWith(pause());
    app.update({ desiredPlaySpeed: 0 });
    fireEvent.click(button);
    expect(app.dispatch).toHaveBeenCalledWith(play(1));
    fireEvent.playing(app.video);
    expect(screen.queryByRole('button', { name: 'Play video' })).not.toBeInTheDocument();
  });

  it('publishes a recovery action that can restart playback outside the video overlay', async () => {
    const onPlaybackStatusChange = vi.fn();
    playVideo.mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError'));
    const app = renderPlayer({ onPlaybackStatusChange });
    await hlsInstance();
    ready(app.video);
    await screen.findByRole('button', { name: 'Play video' });
    const status = onPlaybackStatusChange.mock.lastCall[0];
    expect(status.label).toBe('Play video');
    app.update({ desiredPlaySpeed: 0 });
    act(() => status.recover());
    expect(app.dispatch).toHaveBeenCalledWith(play(1));
    fireEvent.playing(app.video);
    expect(onPlaybackStatusChange).toHaveBeenLastCalledWith(null);
  });

  it('publishes Retry and empty-range notices for a hidden video', async () => {
    const onPlaybackStatusChange = vi.fn();
    const app = renderPlayer({ onPlaybackStatusChange });
    const first = await hlsInstance();
    first.emit('error', { fatal: true, type: 'network', response: { code: 404 } });
    const status = onPlaybackStatusChange.mock.lastCall[0];
    expect(status).toMatchObject({ error: true, label: 'Retry' });
    act(() => status.recover());
    await hlsInstance(1);
    expect(onPlaybackStatusChange).toHaveBeenLastCalledWith(null);
    app.update({ loop: { startTime: 0, duration: 500 }, desiredPlaySpeed: 0 });
    expect(onPlaybackStatusChange).toHaveBeenLastCalledWith({ message: 'No video is available in this selected range.' });
  });

  it('ignores aborted play promises when the user pauses', async () => {
    let reject;
    playVideo.mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const app = renderPlayer();
    await hlsInstance();
    ready(app.video);
    app.update({ desiredPlaySpeed: 0 });
    app.dispatch.mockClear();
    await act(async () => reject(new DOMException('Paused', 'AbortError')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play video' })).not.toBeInTheDocument();
    expect(app.dispatch).not.toHaveBeenCalled();
  });

  it('disposes the transport, live clock, frame callback and media listeners', async () => {
    const app = renderPlayer();
    const hls = await hlsInstance();
    ready(app.video);
    fireEvent.playing(app.video);
    const callback = mocks.subscribeFrames.mock.calls[0][0];
    const unsubscribeFrames = mocks.subscribeFrames.mock.results[0].value;
    const detachClock = mocks.attachClock.mock.results[0].value;
    app.unmount();
    expect(hls.destroy).toHaveBeenCalledOnce();
    expect(detachClock).toHaveBeenCalledOnce();
    expect(unsubscribeFrames).toHaveBeenCalledOnce();
    expect(app.video).not.toHaveAttribute('src');
    expect(app.video.paused).toBe(true);
    app.dispatch.mockClear();
    app.onAudioStatusChange.mockClear();
    fireEvent.timeUpdate(app.video);
    act(() => callback());
    hls.emit('error', { fatal: true, type: 'network' });
    hls.emit('codecs', { audio: {} });
    expect(app.dispatch).not.toHaveBeenCalled();
    expect(app.onAudioStatusChange).not.toHaveBeenCalled();
    expect(mocks.subscribeFrames).toHaveBeenCalledOnce();
  });
});
