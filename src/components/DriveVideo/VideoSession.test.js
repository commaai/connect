import { applyMiddleware, createStore } from 'redux';
import Hls from 'hls.js';
import VideoSession from './VideoSession';
import { attachPlayer, pause, play, playbackMiddleware, seek, selectLoop } from '../../timeline/playback';
import reducer from '../../reducers';
import * as Types from '../../actions/types';

vi.mock('hls.js', () => ({ default: class {
  static isSupported = vi.fn(() => true);
  static Events = { ERROR: 'error' };
  static ErrorTypes = { MEDIA_ERROR: 'mediaError' };
  on = vi.fn((_name, callback) => { this.error = callback; });
  loadSource = vi.fn(); attachMedia = vi.fn(); destroy = vi.fn();
  recoverMediaError = vi.fn(); startLoad = vi.fn();
} }));

let video, store, session, detach, onError;
const event = (name) => video.dispatchEvent(new Event(name));
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  video = document.createElement('video');
  for (const [name, value] of Object.entries({ readyState: 1, duration: 60, paused: true, seeking: false, ended: false })) {
    Object.defineProperty(video, name, { configurable: true, writable: true, value });
  }
  video.play = vi.fn(async () => { video.paused = false; });
  video.pause = vi.fn(() => { video.paused = true; });
  video.load = vi.fn();
  video.canPlayType = vi.fn(() => 'probably');
  store = createStore(reducer, {
    offset: 0, desiredPlaySpeed: 1, isBufferingVideo: true,
    currentRoute: { fullname: 'route', duration: 60000, videoStartOffset: 0 },
    loop: { startTime: 0, duration: 60000 },
  }, applyMiddleware(playbackMiddleware));
  onError = vi.fn();
  session = new VideoSession(video, store.dispatch, onError);
  detach = store.dispatch(attachPlayer((action, state) => session.update(action, state)));
});
afterEach(() => { detach(); session.destroy(); vi.unstubAllGlobals(); });

it('publishes the media clock without correcting time or rate during playback', () => {
  session.load('https://example.com/route.m3u8');
  video.currentTime = 12.5;
  event('timeupdate');
  expect(store.getState().offset).toBe(12500);
  event('waiting');
  event('timeupdate');
  expect(video.currentTime).toBe(12.5);
  expect(video.playbackRate).toBe(1);
  expect(store.getState().offset).toBe(12500);
  expect(video.pause).not.toHaveBeenCalled();
});

it('applies the latest seek once metadata arrives, preserving paused playback', () => {
  video.readyState = 0;
  store.dispatch(pause());
  store.dispatch(seek(10000));
  store.dispatch(seek(25000));
  event('timeupdate');
  expect(store.getState().offset).toBe(25000);
  expect(video.currentTime).toBe(0);
  video.readyState = 1;
  event('loadedmetadata');
  expect(video.currentTime).toBe(25);
  event('seeked');
  event('canplay');
  expect(video.play).not.toHaveBeenCalled();
  expect(store.getState().isBufferingVideo).toBe(false);
});

it('invokes play synchronously during dispatch and follows native pause/rate controls', () => {
  store.dispatch(play(2));
  expect(video.play).toHaveBeenCalledOnce();
  expect(video.playbackRate).toBe(2);
  video.playbackRate = 0.5;
  event('ratechange');
  expect(store.getState().desiredPlaySpeed).toBe(0.5);
  video.paused = true;
  event('pause');
  expect(store.getState().desiredPlaySpeed).toBe(0);
  event('canplay');
  expect(video.play).toHaveBeenCalledOnce();
});

it('loops from zero and within a selection at the actual video boundary', () => {
  video.currentTime = 60; video.ended = true;
  event('ended');
  expect(video.currentTime).toBe(0);
  video.ended = false;
  store.dispatch(selectLoop(10000, 20000));
  event('seeked');
  video.currentTime = 20;
  event('timeupdate');
  expect(video.currentTime).toBe(10);
});

it('clamps to the available video and translates the first camera frame offset', () => {
  store.dispatch({ type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: 'route', events: [
    { type: 'event', data: { event_type: 'first_road_camera_frame' }, route_offset_millis: 3000 },
  ] });
  expect(video.currentTime).toBe(0);
  expect(store.getState().offset).toBe(3000);
});

it('treats autoplay denial as a usable paused player', async () => {
  video.play.mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
  store.dispatch(play());
  await Promise.resolve();
  expect(store.getState().desiredPlaySpeed).toBe(0);
  expect(store.getState().isBufferingVideo).toBe(false);
  expect(onError).not.toHaveBeenCalledWith(expect.any(String));
});

it('ignores stale play rejections after a newer pause command', async () => {
  let reject;
  video.play.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  store.dispatch(play());
  store.dispatch(pause());
  reject(new DOMException('old play', 'NotAllowedError'));
  await Promise.resolve();
  expect(store.getState().desiredPlaySpeed).toBe(0);
  expect(store.getState().isBufferingVideo).toBe(true);
});

it('prefers native HLS; otherwise recovers media errors once and exposes missing segments', () => {
  session.load('https://example.com/route.m3u8');
  expect(session.hls).toBeUndefined();
  video.canPlayType.mockReturnValue('');
  session.load('https://example.com/route.m3u8');
  const hls = session.hls;
  hls.error('error', { type: 'mediaError', fatal: false });
  expect(hls.recoverMediaError).not.toHaveBeenCalled();
  hls.error('error', { type: 'mediaError', fatal: true });
  expect(hls.recoverMediaError).toHaveBeenCalledOnce();
  event('pause');
  expect(store.getState().desiredPlaySpeed).toBe(1);
  hls.error('error', { type: 'mediaError', fatal: true });
  expect(onError).toHaveBeenLastCalledWith(expect.stringContaining('Unable to load'));
  hls.error('error', { fatal: true, response: { code: 404 } });
  expect(onError).toHaveBeenLastCalledWith(expect.stringContaining('not uploaded'));
  store.dispatch(seek(30000));
  expect(hls.startLoad).toHaveBeenCalledWith(30);
});

it('cleans up the media source, listeners, and frame callback', () => {
  video.canPlayType.mockReturnValue('');
  session.load('https://example.com/route.m3u8');
  const hls = session.hls;
  session.destroy();
  onError.mockClear();
  event('error'); event('playing');
  expect(onError).not.toHaveBeenCalled();
  expect(hls.destroy).toHaveBeenCalledOnce();
  expect(video.load).toHaveBeenCalledOnce();
});

it('falls back when a browser advertises native HLS but rejects the stream', () => {
  session.load('https://example.com/route.m3u8');
  event('error');
  expect(session.hls.loadSource).toHaveBeenCalledWith('https://example.com/route.m3u8');
  expect(session.hls.attachMedia).toHaveBeenCalledWith(video);
});

it('exposes unsupported browsers without a permanent loading overlay', () => {
  video.canPlayType.mockReturnValue('');
  Hls.isSupported.mockReturnValueOnce(false);
  session.load('https://example.com/route.m3u8');
  expect(onError).toHaveBeenLastCalledWith(expect.stringContaining('does not support'));
  expect(store.getState().isBufferingVideo).toBe(false);
});

it('clamps native seeks to the selected range and stays paused', () => {
  store.dispatch(pause());
  store.dispatch(selectLoop(10000, 20000));
  event('seeked');
  video.currentTime = 25;
  event('seeked');
  expect(video.currentTime).toBe(20);
  expect(video.paused).toBe(true);
});

it('uses video duration when the log extends beyond the final video frame', () => {
  video.duration = 45;
  video.currentTime = 45;
  event('timeupdate');
  expect(video.currentTime).toBe(0);
});

it('ignores a native play rejection after switching to hls.js', async () => {
  let reject;
  video.play.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  session.load('https://example.com/route.m3u8');
  store.dispatch(play());
  event('error');
  onError.mockClear();
  reject(new DOMException('native source failed', 'NotSupportedError'));
  await Promise.resolve();
  expect(onError).not.toHaveBeenCalled();
  expect(session.failed).toBe(false);
});

it('restarts a failed HLS request on seek even if metadata is temporarily unavailable', () => {
  video.canPlayType.mockReturnValue('');
  session.load('https://example.com/route.m3u8');
  session.hls.error('error', { fatal: true, response: { code: 503 } });
  video.readyState = 0;
  store.dispatch(seek(30000));
  expect(session.hls.startLoad).toHaveBeenCalledWith(30);
  video.readyState = 1;
  event('loadedmetadata');
  expect(video.currentTime).toBe(30);
});
