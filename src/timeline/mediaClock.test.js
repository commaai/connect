import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Types from '../actions/types';
import { createInitialState } from '../initialState';
import { currentOffset } from '.';
import { bufferVideo, pause, play, reducer, releaseVideo, resetPlayback, seek, selectLoop, videoTime } from './playback';

vi.mock('../store', () => ({ default: { getState: vi.fn() } }));

function makeState(overrides = {}) {
  return {
    desiredPlaySpeed: 1,
    isBufferingVideo: false,
    isMediaClock: false,
    seekRevision: 0,
    offset: 0,
    startTime: Date.now(),
    loop: null,
    ...overrides,
  };
}

describe('media-authoritative playback clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to the map clock without a seek command', () => {
    expect(createInitialState('/')).toMatchObject({ isMediaClock: false, seekRevision: 0 });
  });

  it('holds native snapshots without extrapolating or wrapping loops', () => {
    const state = reducer(makeState({ desiredPlaySpeed: 2, seekRevision: 4,
      loop: { startTime: 1000, duration: 1000 } }), videoTime(2500.5));
    expect(state).toMatchObject({ isMediaClock: true, offset: 2500.5,
      startTime: 10000, desiredPlaySpeed: 2, seekRevision: 4 });
    vi.advanceTimersByTime(5000);
    expect(currentOffset(state)).toBe(2500.5);
    expect(reducer(state, { type: 'UNRELATED' }).offset).toBe(2500.5);
    expect(reducer(state, videoTime(500)).offset).toBe(500);
  });

  it('releases video into an advancing map-only clock without changing intent', () => {
    let state = reducer(makeState({ desiredPlaySpeed: 2, seekRevision: 3 }), videoTime(1500));
    state = reducer(state, bufferVideo(true));
    vi.advanceTimersByTime(5000);
    state = reducer(state, releaseVideo());
    expect(state).toMatchObject({ isMediaClock: false, isBufferingVideo: false,
      offset: 1500, desiredPlaySpeed: 2, seekRevision: 3, startTime: 15000 });
    vi.advanceTimersByTime(250);
    expect(currentOffset(state)).toBe(2000);
  });

  it('preserves paused intent when releasing video', () => {
    let state = reducer(makeState(), videoTime(1200));
    state = reducer(state, pause());
    state = reducer(state, releaseVideo());
    vi.advanceTimersByTime(1000);
    expect(state.desiredPlaySpeed).toBe(0);
    expect(currentOffset(state)).toBe(1200);
  });

  it('freezes the fallback clock while buffering and resumes from its anchor', () => {
    vi.advanceTimersByTime(200);
    let state = reducer(makeState({ startTime: 10000 }), bufferVideo(true));
    expect(state.offset).toBe(200);
    vi.advanceTimersByTime(1000);
    expect(currentOffset(state)).toBe(200);
    state = reducer(state, bufferVideo(false));
    vi.advanceTimersByTime(300);
    expect(currentOffset(state)).toBe(500);
  });

  it('increments revisions on every explicit seek, including repeated offsets', () => {
    let state = makeState();
    delete state.seekRevision;
    state = reducer(state, seek(500));
    expect(state.seekRevision).toBe(1);
    state = reducer(state, seek(500));
    expect(state.seekRevision).toBe(2);
    state = reducer(state, videoTime(500));
    state = reducer(state, seek(500));
    expect(state).toMatchObject({ isMediaClock: true, offset: 500, seekRevision: 3 });
  });

  it('clamps explicit seeks in zero-based loops even with the media clock', () => {
    let state = reducer(makeState(), videoTime(500));
    state = reducer(state, selectLoop(0, 1000));
    state = reducer(state, seek(-100));
    expect(state.offset).toBe(0);
    state = reducer(state, seek(1500));
    expect(state.offset).toBe(1000);
    expect(state.seekRevision).toBe(2);
    state = reducer(state, videoTime(1500));
    expect(currentOffset(state)).toBe(1500);
  });

  it('retains virtual wrapping and normalization for zero-based map loops', () => {
    const state = makeState({ offset: 900, loop: { startTime: 0, duration: 1000 } });
    vi.advanceTimersByTime(300);
    expect(currentOffset(state)).toBe(200);
    expect(reducer(state, { type: 'UNRELATED' })).toMatchObject({ offset: 200, startTime: 10300 });
    expect(currentOffset(makeState({ offset: null, loop: state.loop }))).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity, -1, undefined, null, '100'])('rejects invalid native progress %s', (offset) => {
    const state = makeState({ offset: 500 });
    vi.advanceTimersByTime(1000);
    expect(reducer(state, videoTime(offset))).toBe(state);
  });

  it('never turns progress, buffering, or speed updates into seek commands', () => {
    let state = makeState({ seekRevision: 5 });
    for (const offset of [0, 100, 100, 1200, 0]) {
      const action = videoTime(offset);
      expect(action.type).toBe(Types.ACTION_VIDEO_TIME);
      expect(action.type).not.toBe(Types.ACTION_SEEK);
      state = reducer(state, action);
      expect(state.seekRevision).toBe(5);
    }
    state = reducer(state, bufferVideo(true));
    state = reducer(state, play(2));
    expect(state.seekRevision).toBe(5);
  });

  it('resets media authority and advances the revision for a fresh route', () => {
    const state = reducer(makeState({ isMediaClock: true, offset: 500,
      desiredPlaySpeed: 2, seekRevision: 7 }), resetPlayback());
    expect(state).toMatchObject({ isMediaClock: false, seekRevision: 8,
      desiredPlaySpeed: 1, isBufferingVideo: true, offset: 0, startTime: 10000 });
    expect(reducer(makeState({ seekRevision: undefined }), resetPlayback()).seekRevision).toBe(1);
  });
});
