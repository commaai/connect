import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentOffset } from '.';
import { bufferVideo, pause, play, reducer, seek, selectLoop, mediaMiddleware } from './playback';
vi.mock('../store', () => ({ default: { getState: vi.fn() } }));
const initial = () => ({ desiredPlaySpeed: 1, offset: 0, startTime: Date.now(), isBufferingVideo: false });
afterEach(() => vi.useRealTimers());

describe('playback commands and observations', () => {
  it('keeps a clock only for map-only playback, including speed and pause', () => {
    vi.useFakeTimers();
    let state = initial();
    vi.advanceTimersByTime(100);
    state = reducer(state, pause());
    expect(state.offset).toBe(100);
    vi.advanceTimersByTime(100);
    expect(currentOffset(state)).toBe(100);
    state = reducer(state, play(0.5));
    vi.advanceTimersByTime(200);
    expect(currentOffset(state)).toBe(200);
    state = reducer(state, seek(123));
    expect(currentOffset(state)).toBe(123);
  });
  it('clamps explicit seeks at both boundaries, including zero-start ranges', () => {
    const state = reducer(initial(), selectLoop(0, 2000));
    expect(reducer(state, seek(-100)).seekOffset).toBe(0);
    expect(reducer(state, seek(3000)).seekOffset).toBe(2000);
    expect(reducer(state, seek(NaN))).toBe(state);
  });
  it('freezes map-only buffering without changing play intent', () => {
    vi.useFakeTimers();
    let state = reducer(initial(), bufferVideo(true));
    vi.advanceTimersByTime(100);
    expect(currentOffset(state)).toBe(0);
    state = reducer(state, play(2));
    state = reducer(state, bufferVideo(false));
    vi.advanceTimersByTime(100);
    expect(currentOffset(state)).toBe(200);
  });
  it('observations neither advance with wall time nor become seeks; stale observations are rejected', () => {
    vi.useFakeTimers();
    const source = {};
    let state = { ...initial(), mediaSource: source, seekRevision: 3 };
    state = reducer(state, { type: 'ACTION_MEDIA_TIME', source, revision: 3, offset: 1250 });
    vi.advanceTimersByTime(5000);
    expect(currentOffset(state)).toBe(1250);
    expect(state.seekRevision).toBe(3);
    expect(reducer(state, { type: 'ACTION_MEDIA_TIME', source: {}, revision: 3, offset: 5000 })).toBe(state);
    expect(reducer(state, { type: 'ACTION_MEDIA_TIME', source, revision: 2, offset: 5000 })).toBe(state);
    state = reducer(state, seek(2500));
    expect(state.seekRevision).toBe(4);
    expect(state.seekOffset).toBe(2500);
  });
  it('delivers commands synchronously after reducing them, but never forwards observations as commands', () => {
    let state = initial();
    const dispatch = mediaMiddleware({ getState: () => state })(action => { state = reducer(state, action); });
    const player = { update: vi.fn() };
    const unbind = dispatch({ type: 'ACTION_BIND_MEDIA', player });
    dispatch(play(2));
    expect(player.update).toHaveBeenCalledWith(expect.objectContaining({ desiredPlaySpeed: 2, activate: true }));
    player.update.mockClear();
    dispatch({ type: 'ACTION_MEDIA_TIME', source: {}, revision: 0, offset: 100 });
    expect(player.update).not.toHaveBeenCalled();
    unbind(); dispatch(play());
    expect(player.update).not.toHaveBeenCalled();
  });
});
