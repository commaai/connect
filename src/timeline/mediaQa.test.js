import { createController } from './media';
import { reducer, seek, play, pause, selectLoop, progress, mediaSource } from './playback';

// A closer fake than the builder's: many listeners per event, settable snap on seek.
class Video {
  constructor() {
    Object.assign(this, { duration: 60, readyState: 4, paused: true, seeking: false, ended: false, muted: false, playbackRate: 1, snap: 0 });
    this._time = 0;
    this.listeners = [];
    this.play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
    this.pause = vi.fn(() => { this.paused = true; this.fire('pause'); });
  }
  get currentTime() { return this._time; }
  set currentTime(value) { this._time = value + this.snap; }
  addEventListener(name, fn) { this.listeners.push([name, fn]); }
  removeEventListener(name, fn) { this.listeners = this.listeners.filter(([n, f]) => n !== name || f !== fn); }
  fire(name) { [...this.listeners].filter(([n]) => n === name).forEach(([, f]) => f()); }
}
const setup = (extra = {}) => {
  const video = new Video();
  Object.assign(video, extra);
  const callbacks = { onProgress: vi.fn(), onPause: vi.fn(), onStatus: vi.fn() };
  return { video, callbacks, controller: createController(video, callbacks) };
};
const cmd = (offset, revision = 1) => ({ seekOffset: offset, seekRevision: revision });

describe('QA: seek completion', () => {
  it('Q1-B-01 resumes progress when the browser lands slightly off the target', () => {
    const { video, callbacks, controller } = setup({ snap: 0.04 });
    controller.update(cmd(10000));
    video.fire('seeked');
    callbacks.onProgress.mockClear();
    video.currentTime = 10.5;
    video.fire('timeupdate');
    expect(callbacks.onProgress).toHaveBeenCalled();
  });

  it('Q1-B-02 does not freeze when the target is beyond the media duration', () => {
    const { video, callbacks, controller } = setup();
    controller.update(cmd(90000));
    video.fire('seeked');
    callbacks.onProgress.mockClear();
    video.fire('timeupdate');
    expect(callbacks.onProgress).toHaveBeenCalled();
  });

  it('Q1-B-03 does not freeze when the range starts after the media ends', () => {
    const { video, callbacks, controller } = setup();
    controller.update({ range: { start: 120000, end: 130000 }, ...cmd(125000) });
    video.fire('seeked');
    video.fire('timeupdate');
    expect(callbacks.onProgress).toHaveBeenCalled();
  });

  it('Q1-B-04 a pending seek is replaced, not queued, by a newer revision', () => {
    const { video, controller } = setup({ readyState: 0 });
    controller.update(cmd(2000, 1));
    controller.update(cmd(5000, 2));
    video.readyState = 1;
    video.fire('loadedmetadata');
    expect(video.currentTime).toBe(5);
  });

  it('Q1-B-05 same revision is a no-op even when the video moved', () => {
    const { video, controller } = setup();
    controller.update(cmd(4000, 1));
    video.fire('seeked');
    video.currentTime = 9;
    controller.update(cmd(4000, 1));
    expect(video.currentTime).toBe(9);
  });
});

describe('QA: zero start, range and numerics', () => {
  it('Q1-B-06 range starting at zero is honoured and wraps to zero', () => {
    const { video, callbacks, controller } = setup();
    controller.update({ speed: 1, range: { start: 0, end: 10000 }, ...cmd(0) });
    video.fire('seeked');
    video.paused = false;
    video.currentTime = 10.2;
    video.fire('timeupdate');
    expect(video.currentTime).toBeCloseTo(0.2, 5);
    expect(callbacks.onProgress).not.toHaveBeenCalledWith(expect.toSatisfy((v) => v > 10000), expect.anything());
  });

  it('Q1-B-07 videoStartOffset is applied exactly once each way', () => {
    const { video, callbacks, controller } = setup();
    controller.update({ videoStartOffset: 3000, ...cmd(5000) });
    expect(video.currentTime).toBe(2);
    video.fire('seeked');
    expect(callbacks.onProgress).toHaveBeenLastCalledWith(5000, 1);
  });

  it.each([NaN, -1, -Infinity, Infinity, 'x', null])('Q1-B-08 speed %s never plays or throws', (speed) => {
    const { video, controller } = setup();
    expect(() => controller.update({ speed })).not.toThrow();
    expect(video.play).not.toHaveBeenCalled();
  });

  it('Q1-B-09 huge and fractional speeds are capped and applied', () => {
    const { video, controller } = setup();
    controller.update({ speed: 100 });
    expect(video.playbackRate).toBe(16);
    controller.update({ speed: 0.25 });
    expect(video.playbackRate).toBe(0.25);
  });

  it.each([NaN, Infinity, undefined])('Q1-B-10 seek offset %s leaves the video alone', (offset) => {
    const { video, controller } = setup();
    video.currentTime = 7;
    expect(() => controller.update({ seekOffset: offset, seekRevision: 3 })).not.toThrow();
    expect(video.currentTime).toBe(7);
  });

  it('Q1-B-11 range with end before start does not throw or loop forever', () => {
    const { video, controller } = setup();
    expect(() => {
      controller.update({ speed: 1, range: { start: 9000, end: 2000 }, ...cmd(5000) });
      video.fire('timeupdate');
      video.fire('ended');
    }).not.toThrow();
  });

  it('Q1-B-12 subsecond range does not collapse', () => {
    const { video, controller } = setup();
    controller.update({ speed: 1, range: { start: 1000, end: 1100 }, ...cmd(1000) });
    video.fire('seeked');
    video.paused = false;
    video.currentTime = 1.15;
    video.fire('timeupdate');
    expect(video.currentTime).toBeGreaterThanOrEqual(1);
    expect(video.currentTime).toBeLessThan(1.1);
  });
});

describe('QA: lifecycle, races and failures', () => {
  it('Q1-B-13 dispose removes every listener and silences late play results', async () => {
    const { video, callbacks, controller } = setup();
    let reject;
    video.play = vi.fn(() => new Promise((_, r) => { reject = r; }));
    controller.update({ speed: 1 });
    controller.dispose();
    expect(video.listeners).toHaveLength(0);
    reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(callbacks.onStatus).not.toHaveBeenCalled();
    expect(callbacks.onPause).not.toHaveBeenCalled();
    expect(() => controller.update({ speed: 1 })).not.toThrow();
  });

  it('Q1-B-14 blocked autoplay reports once and a later user play retries', async () => {
    const { video, callbacks, controller } = setup();
    video.play = vi.fn(() => Promise.reject(Object.assign(new Error('b'), { name: 'NotAllowedError' })));
    controller.update({ speed: 1 });
    await Promise.resolve(); await Promise.resolve();
    expect(callbacks.onPause).toHaveBeenCalledTimes(1);
    expect(callbacks.onStatus).toHaveBeenCalledWith(expect.objectContaining({ blocked: true }));
    video.play = vi.fn(() => { video.paused = false; return Promise.resolve(); });
    controller.update({ speed: 1 });
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('Q1-B-15 external pause reports pause once and does not auto-resume', () => {
    const { video, callbacks, controller } = setup();
    controller.update({ speed: 1 });
    video.paused = true;
    video.fire('pause');
    video.fire('pause');
    expect(callbacks.onPause).toHaveBeenCalledTimes(1);
    video.fire('timeupdate');
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('Q1-B-16 a play AbortError from a pause is not reported as failure', async () => {
    const { video, callbacks, controller } = setup();
    video.play = vi.fn(() => Promise.reject(Object.assign(new Error('a'), { name: 'AbortError' })));
    controller.update({ speed: 1 });
    await Promise.resolve(); await Promise.resolve();
    expect(callbacks.onStatus).not.toHaveBeenCalled();
  });

  it('Q1-B-17 media error is reported', () => {
    const { video, callbacks } = setup();
    video.error = { code: 3 };
    video.fire('error');
    expect(callbacks.onStatus).toHaveBeenCalledWith({ error: video.error });
  });

  it('Q1-B-18 play after a failed attempt is not stuck in the starting state', async () => {
    const { video, controller } = setup();
    video.play = vi.fn(() => Promise.reject(new Error('decode')));
    controller.update({ speed: 1 });
    await Promise.resolve(); await Promise.resolve();
    video.play = vi.fn(() => Promise.resolve());
    controller.update({ speed: 1 });
    expect(video.play).toHaveBeenCalled();
  });

  it('Q1-B-19 ended without a range pauses; with a range it loops once', async () => {
    const a = setup();
    a.controller.update({ speed: 1 });
    a.video.ended = true;
    a.video.fire('ended');
    expect(a.callbacks.onPause).toHaveBeenCalledTimes(1);
    const b = setup();
    b.controller.update({ speed: 1, range: { start: 2000, end: 5000 }, ...cmd(2000) });
    await Promise.resolve();
    b.video.fire('seeked');
    b.video.paused = true;
    b.video.ended = true;
    b.video.currentTime = 5;
    b.video.fire('ended');
    expect(b.video.currentTime).toBe(2);
    expect(b.video.play).toHaveBeenCalledTimes(2);
  });

  it('Q1-B-20 pausing at the loop end does not wrap', () => {
    const { video, controller } = setup();
    controller.update({ speed: 0, range: { start: 0, end: 5000 }, ...cmd(0) });
    video.fire('seeked');
    video.currentTime = 5;
    video.fire('timeupdate');
    expect(video.currentTime).toBe(5);
  });
});

describe('QA: mutation gaps', () => {
  it('Q1-B-26 a range starting at route zero is not replaced by videoStartOffset', () => {
    const { video, controller } = setup();
    controller.update({ videoStartOffset: 3000, range: { start: 0, end: 10000 }, ...cmd(1000) });
    expect(video.currentTime).toBe(0);
  });

  it('Q1-B-27 a decode failure is an error, not a blocked-play prompt', async () => {
    const { video, callbacks, controller } = setup();
    video.play = vi.fn(() => Promise.reject(Object.assign(new Error('d'), { name: 'EncodingError' })));
    controller.update({ speed: 1 });
    await Promise.resolve(); await Promise.resolve();
    expect(callbacks.onStatus).toHaveBeenCalledWith(expect.objectContaining({ error: expect.anything() }));
    expect(callbacks.onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ blocked: true }));
  });

  it('Q1-B-28 a seek that lands 5ms off is still reported as unsettled until seeked', () => {
    const { callbacks, controller } = setup({ snap: 0.005 });
    controller.update(cmd(10000));
    expect(callbacks.onProgress).not.toHaveBeenCalledWith(expect.anything(), 1);
  });
});

describe('QA: reducer', () => {
  const base = { offset: 0, seekOffset: 0, seekRevision: 0, desiredPlaySpeed: 1, loop: null, zoom: null, mediaSource: 's1' };
  it('Q1-B-21 rejects stale source, stale revision, negative and NaN progress', () => {
    let state = reducer(base, seek(5000));
    expect(state.seekRevision).toBe(1);
    for (const action of [progress('old', 1, 9000), progress('s1', 0, 9000), progress('s1', 1, -1), progress('s1', 1, NaN)]) {
      expect(reducer(state, action)).toBe(state);
    }
    expect(reducer(state, progress('s1', 1, 0)).offset).toBe(0);
  });
  it('Q1-B-22 seek clamps into the loop and ignores non-finite targets', () => {
    const state = reducer(base, selectLoop(10000, 20000));
    expect(reducer(state, seek(0)).offset).toBe(10000);
    expect(reducer(state, seek(99999)).offset).toBe(20000);
    expect(reducer(state, seek(NaN))).toBe(state);
    expect(reducer(state, seek(Infinity))).toBe(state);
  });
  it('Q1-B-23 loop starting at zero is a real loop, bad loops are cleared', () => {
    const zero = reducer(base, selectLoop(0, 5000));
    expect(zero.loop).toEqual({ startTime: 0, duration: 5000 });
    expect(reducer(zero, seek(9000)).offset).toBe(5000);
    for (const [a, b] of [[5, 5], [9, 2], [-1, 5], [NaN, 5], [null, 5]]) expect(reducer(zero, selectLoop(a, b)).loop).toBeNull();
  });
  it('Q1-B-24 play and pause preserve offset and never invent time', () => {
    const state = reducer(base, seek(4000));
    expect(reducer(reducer(state, pause()), play(2)).offset).toBe(4000);
    expect(reducer(state, play(NaN))).toBe(state);
    expect(reducer(state, play(-1))).toBe(state);
    expect(reducer(state, play(99)).desiredPlaySpeed).toBe(16);
  });
  it('Q1-B-25 changing source does not move the offset or bump the revision', () => {
    const state = reducer(base, seek(4000));
    const next = reducer(state, mediaSource('s2'));
    expect(next.offset).toBe(4000);
    expect(next.seekRevision).toBe(state.seekRevision);
  });
});

describe('QA: cycle 2 additions', () => {
  it('Q1-B-29 a stale seeked from an older seek does not complete a newer pending seek', () => {
    const { video, callbacks, controller } = setup();
    controller.update(cmd(2000, 1));
    video.seeking = true;
    controller.update(cmd(8000, 2));
    video.fire('seeked');
    expect(callbacks.onProgress).not.toHaveBeenCalledWith(expect.anything(), 2);
  });

  it('Q1-B-30 frame sampling stops after dispose and never extrapolates', () => {
    const frames = [];
    const { video, callbacks, controller } = setup();
    video.cancelVideoFrameCallback = vi.fn();
    video.requestVideoFrameCallback = vi.fn((fn) => { frames.push(fn); return frames.length; });
    const again = createController(video, callbacks);
    again.update({ speed: 1, ...cmd(1000) });
    video.fire('seeked');
    callbacks.onProgress.mockClear();
    video.currentTime = 1.5;
    frames.at(-1)(1000);
    expect(callbacks.onProgress).toHaveBeenLastCalledWith(1500, 1);
    again.dispose();
    expect(video.cancelVideoFrameCallback).toHaveBeenCalled();
    callbacks.onProgress.mockClear();
    frames.at(-1)(5000);
    expect(callbacks.onProgress).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('Q1-B-31 unknown duration still completes a metadata-ready seek', () => {
    const { video, callbacks, controller } = setup({ duration: NaN });
    controller.update(cmd(4000));
    video.fire('seeked');
    expect(video.currentTime).toBe(4);
    expect(callbacks.onProgress).toHaveBeenCalledWith(4000, 1);
  });
});
