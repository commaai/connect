import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachSource } from './transport';

function media(native = false) {
  const video = new EventTarget();
  Object.assign(video, { src: '', currentTime: 3, muted: true, load: vi.fn(), pause: vi.fn(), removeAttribute: vi.fn(), canPlayType: () => native ? 'maybe' : '' });
  return video;
}
function engine() {
  let player;
  class Hls {
    static Events = { ERROR: 'error', LEVEL_LOADED: 'manifest', BUFFER_CODECS: 'audio' };
    static isSupported = () => true;
    constructor() { player = this; this.handlers = {}; }
    on(event, fn) { this.handlers[event] = fn; }
    loadSource = vi.fn(); attachMedia = vi.fn(); destroy = vi.fn();
    startLoad = vi.fn(); recoverMediaError = vi.fn(); stopLoad = vi.fn();
    emit(error) { this.handlers.error('error', error); }
  }
  return { Hls, get player() { return player; } };
}
async function mse() {
  const sdk = engine(); const onStatus = vi.fn(); const video = media();
  const source = attachSource(video, { src: 'clip.m3u8', onStatus, loadHls: async () => ({ default: sdk.Hls }) });
  await vi.waitFor(() => expect(sdk.player).toBeDefined());
  return { sdk, onStatus, source, video };
}
afterEach(() => { vi.useRealTimers(); });

describe('video transport', () => {
  it('prefers native HLS without downloading a decoder', () => {
    const video = media(true); const loadHls = vi.fn();
    const source = attachSource(video, { src: 'clip.m3u8', onStatus: vi.fn(), loadHls });
    expect(video.src).toBe('clip.m3u8'); expect(loadHls).not.toHaveBeenCalled();
    source.destroy();
  });
  it('does not change buffering or error for nonfatal HLS notifications', async () => {
    const { sdk, onStatus, source, video } = await mse();
    video.dispatchEvent(new Event('playing')); onStatus.mockClear();
    sdk.player.emit({ fatal: false, type: 'networkError', response: { code: 404 } });
    expect(onStatus).not.toHaveBeenCalled(); source.destroy();
  });
  it.each(['networkError', 'mediaError'])('limits automatic %s recovery to one attempt', async type => {
    const { sdk, onStatus, source } = await mse();
    sdk.player.emit({ fatal: true, type }); sdk.player.emit({ fatal: true, type });
    expect(type === 'networkError' ? sdk.player.startLoad : sdk.player.recoverMediaError).toHaveBeenCalledOnce();
    expect(onStatus.mock.lastCall[0].error).toContain('Unable to load'); source.destroy();
  });
  it('does not silently skip fatal missing footage', async () => {
    const { sdk, onStatus, source } = await mse();
    sdk.player.emit({ fatal: true, type: 'networkError', response: { code: 404 } });
    expect(sdk.player.startLoad).not.toHaveBeenCalled();
    expect(onStatus.mock.lastCall[0].error).toContain('not uploaded'); source.destroy();
  });
  it('offers play activation without treating autoplay denial as a load failure', async () => {
    const { source, onStatus } = await mse();
    source.reportError({ name: 'NotAllowedError' });
    expect(onStatus.mock.lastCall[0]).toEqual({ loading: false, error: null, blocked: true }); source.destroy();
  });
  it('drops decoder initialization after a route switch', async () => {
    const sdk = engine(); let finish;
    const source = attachSource(media(), { src: 'old', onStatus: vi.fn(), loadHls: () => new Promise(resolve => { finish = resolve; }) });
    source.destroy(); finish({ default: sdk.Hls }); await Promise.resolve();
    expect(sdk.player).toBeUndefined();
  });
  it('drops errors from the destroyed source generation', async () => {
    const { sdk, source, onStatus } = await mse();
    source.destroy(); onStatus.mockClear(); sdk.player.emit({ fatal: true });
    expect(onStatus).not.toHaveBeenCalled();
  });
  it('bounds a stalled native manifest instead of loading forever', () => {
    vi.useFakeTimers(); const onStatus = vi.fn();
    const source = attachSource(media(true), { src: 'stall', onStatus });
    vi.advanceTimersByTime(15000);
    expect(onStatus.mock.lastCall[0].error).toContain('taking too long'); source.destroy();
  });
  it('keeps audio state and media position unchanged on blocked play', () => {
    const video = media(true); video.muted = false;
    const source = attachSource(video, { src: 'clip', onStatus: vi.fn() });
    source.reportError({ name: 'NotAllowedError' });
    expect(video.muted).toBe(false); expect(video.currentTime).toBe(3); source.destroy();
  });
});

it('fetches numbered timing once and ignores an abandoned response', async () => {
  const onTimeline = vi.fn(); let finish;
  const fetchPlaylist = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const source = attachSource(media(true), { src: 'clip', onStatus: vi.fn(), onTimeline, fetchPlaylist });
  source.destroy();
  finish({ ok: true, text: async () => '#EXTM3U\n#EXTINF:2.5,3\n3.ts\n' });
  await Promise.resolve(); await Promise.resolve();
  expect(onTimeline).not.toHaveBeenCalled();
  expect(fetchPlaylist.mock.calls[0][1].signal.aborted).toBe(true);
});
it('sends native HLS timing through the same numbered playlist parser', async () => {
  const onTimeline = vi.fn();
  const fetchPlaylist = vi.fn(async () => ({ ok: true, text: async () => '#EXTM3U\n#EXTINF:2.5,3\n3.ts\n' }));
  const source = attachSource(media(true), { src: 'clip', onStatus: vi.fn(), onTimeline, fetchPlaylist });
  await vi.waitFor(() => expect(onTimeline).toHaveBeenCalledWith([{ number: 3, start: 0, duration: 2.5 }]));
  expect(fetchPlaylist).toHaveBeenCalledOnce(); source.destroy();
});
it('a repeated waiting event cannot keep the watchdog alive indefinitely', () => {
  vi.useFakeTimers(); const video = media(true); const onStatus = vi.fn();
  const source = attachSource(video, { src: 'clip', onStatus });
  vi.advanceTimersByTime(10000); video.dispatchEvent(new Event('waiting'));
  vi.advanceTimersByTime(5000);
  expect(onStatus.mock.lastCall[0].error).toContain('taking too long'); source.destroy();
});
it('explicit retry gets a fresh bounded decoder recovery budget', async () => {
  const { sdk, source, onStatus } = await mse();
  sdk.player.emit({ fatal: true, type: 'mediaError' });
  sdk.player.emit({ fatal: true, type: 'mediaError' });
  const oldPlayer = sdk.player; await source.retry();
  expect(oldPlayer.destroy).toHaveBeenCalledOnce();
  sdk.player.emit({ fatal: true, type: 'mediaError' });
  expect(sdk.player.recoverMediaError).toHaveBeenCalledOnce();
  expect(onStatus.mock.lastCall[0].error).toBeNull(); source.destroy();
});
it('canplay does not remove the user activation prompt', () => {
  const video = media(true); const onStatus = vi.fn();
  const source = attachSource(video, { src: 'clip', onStatus });
  source.reportError({ name: 'NotAllowedError' }); video.dispatchEvent(new Event('canplay'));
  expect(onStatus.mock.lastCall[0].blocked).toBe(true);
  video.dispatchEvent(new Event('playing'));
  expect(onStatus.mock.lastCall[0].blocked).toBe(false); source.destroy();
});
it('late canplay does not erase a terminal error before Retry', async () => {
  const { sdk, source, video, onStatus } = await mse();
  sdk.player.emit({ fatal: true, type: 'networkError', response: { code: 404 } });
  video.dispatchEvent(new Event('canplay')); video.dispatchEvent(new Event('playing'));
  expect(onStatus.mock.lastCall[0].error).toContain('not uploaded'); source.destroy();
});
it('bounds native network reloads and explains unsupported sources', () => {
  const video = media(true); const onStatus = vi.fn();
  const source = attachSource(video, { src: 'clip', onStatus });
  source.reportError({ code: 2 }); source.reportError({ code: 2 });
  expect(video.load).toHaveBeenCalledTimes(2);
  expect(onStatus.mock.lastCall[0].error).toContain('Unable to load');
  source.destroy();
  const unsupported = attachSource(media(true), { src: 'clip', onStatus });
  unsupported.reportError({ code: 4 });
  expect(onStatus.mock.lastCall[0].error).toContain('not supported'); unsupported.destroy();
});
it('retires native audio and the old source after removing status callbacks', () => {
  const video = media(true); const onStatus = vi.fn();
  const source = attachSource(video, { src: 'old.m3u8', onStatus });
  video.pause.mockImplementation(() => video.dispatchEvent(new Event('waiting')));
  onStatus.mockClear(); source.destroy();
  expect(video.pause).toHaveBeenCalledOnce();
  expect(video.removeAttribute).toHaveBeenCalledWith('src');
  expect(video.load).toHaveBeenCalledTimes(2);
  expect(onStatus).not.toHaveBeenCalled();
});
