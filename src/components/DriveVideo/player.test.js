import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPlayer } from './player';

const route = { segment_numbers: [0, 2], segment_start_times: [1000, 121000], segment_end_times: [61000, 181000] };
const playlist = '#EXTM3U\n#EXTINF:60,0\n0.ts\n#EXTINF:60,2\n2.ts\n';
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const players = [];
function setup(options = {}) {
  vi.useFakeTimers();
  const video = new EventTarget();
  let time = 0;
  const writes = [];
  Object.assign(video, { readyState: 0, duration: NaN, seeking: false, paused: true, ended: false,
    buffered: { length: 0, start: () => 0 }, canPlayType: () => options.native === false ? '' : 'maybe', load: vi.fn(),
    pause: vi.fn(() => { video.paused = true; }), play: vi.fn(async () => { video.paused = false; }),
    removeAttribute: vi.fn(), getAttribute: () => 'clip',
  });
  Object.defineProperty(video, 'currentTime', { get: () => time, set: value => { writes.push(value); time = value; video.seeking = true; } });
  const onTime = vi.fn(); const onStatus = vi.fn();
  const player = createPlayer(video, { src: 'clip', route, onTime, onStatus, onAudio: vi.fn(), onPlaying: vi.fn(),
    fetchPlaylist: async () => ({ ok: true, text: async () => playlist }), ...options });
  players.push(player);
  const emit = event => video.dispatchEvent(new Event(event));
  const finish = () => { video.seeking = false; emit('seeked'); };
  const ready = () => { video.readyState = 4; video.duration = 120; video.buffered.length = 1; emit('canplay'); };
  const observe = value => { time = value; emit('timeupdate'); };
  player.update({ desiredPlaySpeed: 1, offset: 0, seekRevision: 0, loop: { startTime: 0, duration: 180000 } });
  return { player, video, writes, onTime, onStatus, emit, finish, ready, observe };
}
afterEach(() => { players.splice(0).forEach(player => player.destroy()); vi.useRealTimers(); });

describe('native playback', () => {
  it('holds the newest seek until both mapping and buffered media exist', async () => {
    let resolve;
    const s = setup({ fetchPlaylist: () => new Promise(r => { resolve = r; }) });
    s.player.update({ seekRevision: 1, seekOffset: 130000 });
    s.ready();
    expect(s.writes).toEqual([]);
    resolve({ ok: true, text: async () => playlist }); await flush();
    expect(s.writes).toEqual([70]);
    expect(s.video.play).not.toHaveBeenCalled();
    s.finish();
    expect(s.video.play).toHaveBeenCalledOnce();
    expect(s.onTime).toHaveBeenLastCalledWith(130000, 1);
  });
  it('metadata alone cannot trigger an empty-buffer startup seek', async () => {
    const s = setup(); await flush();
    s.player.update({ seekRevision: 1, seekOffset: 20000 });
    s.video.readyState = 1; s.emit('loadedmetadata');
    expect(s.writes).toEqual([]);
    s.ready(); expect(s.writes).toEqual([20]);
  });
  it('publishes media observations without writing currentTime back', async () => {
    const s = setup(); await flush(); s.ready();
    s.observe(65); s.observe(66);
    expect(s.onTime).toHaveBeenLastCalledWith(126000, 0);
    expect(s.writes).toEqual([]);
  });
  it('loops a zero-start range and preserves paused end positions', async () => {
    const s = setup(); await flush(); s.ready();
    s.player.update({ loop: { startTime: 0, duration: 10000 } });
    s.observe(10); expect(s.writes).toEqual([0]); s.finish();
    s.player.update({ desiredPlaySpeed: 0, seekRevision: 1, seekOffset: 10000 }); s.finish();
    s.observe(10); expect(s.onTime).toHaveBeenLastCalledWith(10000, 1);
    expect(s.writes).toEqual([0, 10]);
  });
  it('does not retry blocked autoplay on each frame; explicit Play retries', async () => {
    const s = setup();
    s.video.play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
    await flush(); s.ready(); await flush();
    vi.advanceTimersByTime(100);
    expect(s.video.play).toHaveBeenCalledOnce();
    expect(s.onStatus).toHaveBeenCalledWith({ blocked: true, buffering: false });
    s.player.update({ activate: true });
    expect(s.video.play).toHaveBeenCalledTimes(2);
  });
  it('does not resume after an explicit pause while timing is delayed', async () => {
    const s = setup(); s.player.update({ desiredPlaySpeed: 0 }); await flush(); s.ready();
    expect(s.video.play).not.toHaveBeenCalled();
  });
  it('ignores delayed playlist and media events after source disposal', async () => {
    let resolve;
    const s = setup({ fetchPlaylist: () => new Promise(r => { resolve = r; }) });
    s.player.destroy(); s.onStatus.mockClear();
    resolve({ ok: true, text: async () => playlist }); await flush(); s.ready(); s.observe(5);
    expect(s.onStatus).not.toHaveBeenCalled(); expect(s.onTime).not.toHaveBeenCalled();
  });
  it('provides a retryable error for stalled startup', () => {
    const s = setup({ fetchPlaylist: () => new Promise(() => {}) });
    vi.advanceTimersByTime(15000);
    expect(s.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.stringContaining('too long') }));
  });
});

it('loads HLS lazily, bounds fatal recovery, and ignores retired engine callbacks', async () => {
  let engine;
  class Hls {
    static isSupported = () => true;
    static Events = { ERROR: 'error', BUFFER_CODECS: 'audio', FRAG_BUFFERED: 'buffered' };
    constructor() { engine = this; this.handlers = {}; }
    on(event, fn) { this.handlers[event] = fn; }
    loadSource = vi.fn(); attachMedia = vi.fn(); startLoad = vi.fn();
    stopLoad = vi.fn(); recoverMediaError = vi.fn(); destroy = vi.fn();
  }
  const s = setup({ native: false, loadHls: async () => ({ default: Hls }) });
  await flush();
  expect(engine.attachMedia).toHaveBeenCalledWith(s.video);
  engine.handlers.error('error', { fatal: false, type: 'networkError' });
  expect(engine.startLoad).not.toHaveBeenCalled();
  engine.handlers.error('error', { fatal: true, type: 'networkError' });
  expect(engine.startLoad).toHaveBeenCalledOnce();
  engine.handlers.error('error', { fatal: true, type: 'networkError' });
  expect(s.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.stringContaining('Unable to load') }));
  s.player.destroy(); s.onStatus.mockClear();
  engine.handlers.error('error', { fatal: true, type: 'mediaError' });
  expect(s.onStatus).not.toHaveBeenCalled();
  expect(engine.destroy).toHaveBeenCalledOnce();
});
it('does not attach a decoder imported after disposal', async () => {
  let resolve;
  const Hls = vi.fn(); Hls.isSupported = () => true;
  const s = setup({ native: false, loadHls: () => new Promise(r => { resolve = r; }) });
  s.player.destroy(); resolve({ default: Hls }); await flush();
  expect(Hls).not.toHaveBeenCalled();
});
it('preserves a retry target inside the current range', async () => {
  const s = setup(); await flush();
  s.player.update({ seekRevision: 2, seekOffset: 130000 }); s.ready();
  expect(s.writes).toEqual([70]);
});
it('a delayed seek completion cannot acknowledge a newer target', async () => {
  const s = setup(); await flush(); s.ready();
  s.player.update({ seekRevision: 1, seekOffset: 10000 });
  s.player.update({ seekRevision: 2, seekOffset: 20000 });
  s.observe(10); s.finish();
  expect(s.writes.at(-1)).toBe(20);
  expect(s.onTime).not.toHaveBeenCalledWith(10000, 2);
  s.finish(); expect(s.onTime).toHaveBeenLastCalledWith(20000, 2);
});

it('updates late alignment without moving the video and uses it for subsequent seeks and loops', async () => {
  const s = setup(); await flush(); s.ready();
  s.observe(10);
  expect(s.onTime).toHaveBeenLastCalledWith(10000, 0);
  s.player.update({ currentRoute: { ...route, videoStartOffset: 5000 } });
  expect(s.video.currentTime).toBe(10);
  expect(s.writes).toEqual([]);
  expect(s.onTime).toHaveBeenLastCalledWith(15000, 0);
  s.player.update({ seekRevision: 1, seekOffset: 25000 });
  expect(s.writes.at(-1)).toBe(20);
  s.finish();
  expect(s.onTime).toHaveBeenLastCalledWith(25000, 1);
  s.player.update({ loop: { startTime: 15000, duration: 10000 } }); s.finish();
  s.observe(20);
  expect(s.writes.at(-1)).toBe(10);
});
it('reconverts an in-flight seek when alignment changes without losing the newer command', async () => {
  const s = setup(); await flush(); s.ready();
  s.player.update({ seekRevision: 1, seekOffset: 20000 });
  expect(s.writes.at(-1)).toBe(20);
  s.player.update({ currentRoute: { ...route, videoStartOffset: 5000 } });
  expect(s.writes.at(-1)).toBe(15);
  s.player.update({ seekRevision: 2, seekOffset: 30000 });
  s.finish();
  expect(s.onTime).toHaveBeenLastCalledWith(30000, 2);
  expect(s.video.currentTime).toBe(25);
});
it('uses timing updates received before the playlist, and subsequent segment timestamp changes', async () => {
  let resolve;
  const s = setup({ fetchPlaylist: () => new Promise(r => { resolve = r; }) });
  s.player.update({ seekRevision: 1, seekOffset: 20000, currentRoute: { ...route, videoStartOffset: 5000 } });
  s.ready();
  resolve({ ok: true, text: async () => playlist }); await flush();
  expect(s.writes.at(-1)).toBe(15); s.finish();
  s.player.update({ currentRoute: { ...route, videoStartOffset: 5000,
    segment_start_times: [1000, 131000], segment_end_times: [61000, 191000] } });
  s.observe(65);
  expect(s.onTime).toHaveBeenLastCalledWith(135000, 1);
});
it('keeps a stall active across download and HLS fragment progress, then cancels and restarts recovery correctly', async () => {
  let engine;
  class Hls {
    static isSupported = () => true;
    static Events = { ERROR: 'error', BUFFER_CODECS: 'audio', FRAG_BUFFERED: 'buffered' };
    constructor() { engine = this; this.handlers = {}; }
    on(event, callback) { this.handlers[event] = callback; }
    loadSource() {} attachMedia() {} stopLoad() {} destroy() {}
  }
  const s = setup({ native: false, loadHls: async () => ({ default: Hls }) });
  await flush(); s.ready();
  s.video.readyState = 2; s.emit('waiting'); s.onStatus.mockClear();
  vi.advanceTimersByTime(10000);
  s.emit('progress'); engine.handlers.buffered();
  expect(s.onStatus).not.toHaveBeenCalledWith({ buffering: false });
  s.emit('canplay');
  expect(s.onStatus).not.toHaveBeenCalledWith({ buffering: false });
  s.ready();
  expect(s.onStatus).toHaveBeenLastCalledWith({ buffering: false });
  s.onStatus.mockClear(); vi.advanceTimersByTime(6000);
  expect(s.onStatus).not.toHaveBeenCalled();
  s.video.readyState = 2; s.emit('waiting');
  vi.advanceTimersByTime(10000); s.emit('waiting');
  s.emit('progress'); engine.handlers.buffered();
  vi.advanceTimersByTime(5000);
  expect(s.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ error: 'Video stalled. Retry to try again.' }));
});
it('cancels stall recovery on pause and disposal', async () => {
  const s = setup(); await flush(); s.ready();
  s.video.readyState = 2; s.emit('waiting');
  s.player.update({ desiredPlaySpeed: 0 });
  expect(s.onStatus).toHaveBeenLastCalledWith({ buffering: false });
  s.onStatus.mockClear(); s.emit('waiting'); vi.advanceTimersByTime(16000);
  expect(s.onStatus).not.toHaveBeenCalled();
  s.player.update({ desiredPlaySpeed: 1 }); s.emit('waiting');
  s.player.destroy(); s.onStatus.mockClear(); vi.advanceTimersByTime(16000);
  expect(s.onStatus).not.toHaveBeenCalled();
});
