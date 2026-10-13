import RoutePlayer from './player';
import { loadVideoSource } from './source';
import { readRouteOffsetMs, resetMediaSessionForTests } from '../../timeline/media';

vi.mock('./source', () => ({ loadVideoSource: vi.fn(() => vi.fn()) }));
let player;
let video;
let options;
const event = (name) => video.dispatchEvent(new Event(name));

beforeEach(() => {
  vi.useFakeTimers();
  resetMediaSessionForTests();
  video = Object.assign(new EventTarget(), { currentTime: 0, duration: 924.050522,
    readyState: 0, paused: true, seeking: false, ended: false, muted: true, playbackRate: 1,
    play: vi.fn().mockResolvedValue(), pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn(),
    requestVideoFrameCallback: vi.fn(() => 1), cancelVideoFrameCallback: vi.fn() });
  options = { currentRoute: { fullname: 'a|one', duration: 925000, videoStartOffset: 849 },
    zoom: { start: 0, end: 925000 }, offset: 0, playRequested: true, playSpeed: 1,
    isMuted: true, onSnapshot: vi.fn(), onFeedback: vi.fn(), onRetry: vi.fn() };
  player = new RoutePlayer(video, options);
  player.start('test.m3u8');
});
afterEach(() => { player.dispose(); vi.useRealTimers(); });

it('queues seeking and rate until metadata, retaining the first-frame offset', () => {
  player.seek(12349);
  player.play(0.5);
  expect(video.play).not.toHaveBeenCalled();
  video.readyState = 2;
  event('loadedmetadata');
  expect(video.currentTime).toBe(11.5);
  expect(video.playbackRate).toBe(0.5);
  expect(player.readOffset()).toBe(12349);
});

it('keeps time updates out of Redux and takes retry snapshots from native media', () => {
  video.readyState = 2;
  event('loadedmetadata');
  options.onSnapshot.mockClear();
  video.currentTime = 12;
  event('timeupdate');
  expect(options.onSnapshot).not.toHaveBeenCalled();
  expect(player.snapshot().offset).toBe(12849);
  expect(readRouteOffsetMs(options)).toBe(12849);
});

it('retries blocked play directly and ignores obsolete rejections after pause/disposal', async () => {
  video.readyState = 2;
  event('loadedmetadata');
  video.play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
  player.play();
  await Promise.resolve();
  expect(options.onFeedback).toHaveBeenLastCalledWith({ tapToPlay: true, loading: false });
  player.play();
  expect(video.play).toHaveBeenCalledTimes(3);
  let reject;
  video.play.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  player.play();
  player.pause();
  options.onFeedback.mockClear();
  reject(new DOMException('obsolete', 'NotAllowedError'));
  await Promise.resolve();
  expect(options.onFeedback).not.toHaveBeenCalled();
  player.play();
  player.dispose();
  reject(new DOMException('obsolete', 'NotAllowedError'));
  await Promise.resolve();
  expect(options.onFeedback).not.toHaveBeenCalled();
});

it('loops at actual media end even when it ends before the route', () => {
  video.readyState = 2;
  event('loadedmetadata');
  video.currentTime = video.duration;
  video.ended = true;
  video.paused = true;
  event('pause');
  event('ended');
  expect(video.currentTime).toBe(0);
  expect(video.play).toHaveBeenCalledTimes(2);
  expect(player.requestedPlaying).toBe(true);
  expect(player.readOffset()).toBe(849);
});

it('retains pause through a range edit and respects late videoStartOffset updates', () => {
  video.readyState = 2;
  event('loadedmetadata');
  player.pause();
  video.play.mockClear();
  player.update({ zoom: { start: 10000, end: 20000 },
    currentRoute: { ...options.currentRoute, videoStartOffset: 1849 } });
  expect(player.readOffset()).toBe(10000);
  expect(video.currentTime).toBe(8.151);
  expect(player.requestedPlaying).toBe(false);
  expect(video.play).not.toHaveBeenCalled();
});

it('preserves intent when a queued native pause arrives after the loop already rewound', () => {
  video.readyState = 2;
  event('loadedmetadata');
  video.paused = false;
  video.currentTime = video.duration;
  event('timeupdate');
  expect(video.currentTime).toBe(0);
  video.paused = true;
  video.ended = false;
  event('pause');
  event('ended');
  expect(player.requestedPlaying).toBe(true);
  expect(video.play).toHaveBeenCalledTimes(2);
});

it('does not play an unavailable range and recovers when the selection becomes playable', () => {
  player.update({ zoom: { start: 0, end: 500 } });
  video.readyState = 2;
  event('loadedmetadata');
  expect(video.play).not.toHaveBeenCalled();
  expect(options.onFeedback).toHaveBeenCalledWith(expect.objectContaining({
    error: 'No video is available in this selected range.',
  }));
  player.update({ zoom: { start: 0, end: 20000 } });
  expect(video.play).toHaveBeenCalledOnce();
  expect(player.failed).toBe(false);
});

it('does not wait indefinitely for loading, and retries connection failure on online', () => {
  vi.advanceTimersByTime(16000);
  expect(options.onFeedback).toHaveBeenLastCalledWith(expect.objectContaining({
    error: expect.stringContaining('timed out'), loading: false,
  }));
  window.dispatchEvent(new Event('online'));
  expect(options.onRetry).toHaveBeenCalledOnce();
});

it('retains playing intent across decoder recovery and resumes when media is ready', () => {
  video.readyState = 2;
  event('loadedmetadata');
  loadVideoSource.mock.calls.at(-1)[2].onRecover();
  event('pause');
  event('canplay');
  expect(player.requestedPlaying).toBe(true);
  expect(video.play).toHaveBeenCalledTimes(2);
});

it('cleans up frames, events, timers and the media session', () => {
  video.readyState = 2;
  video.paused = false;
  event('loadedmetadata');
  event('playing');
  player.dispose();
  expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(1);
  options.onSnapshot.mockClear();
  event('pause');
  window.dispatchEvent(new Event('online'));
  vi.advanceTimersByTime(20000);
  expect(options.onSnapshot).not.toHaveBeenCalled();
  expect(options.onRetry).not.toHaveBeenCalled();
  expect(readRouteOffsetMs(options)).toBe(0);
});
