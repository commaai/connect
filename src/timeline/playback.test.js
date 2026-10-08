import { vi } from 'vitest';
import { currentOffset } from '.';
import { bufferVideo, pause, play, reducer, resetPlayback, seek, selectLoop, videoProgress } from './playback';

vi.mock('../store', () => ({ default: { getState: () => ({ offset: 0 }) } }));

const defaultState = () => ({
  desiredPlaySpeed: 1,
  offset: 0,
  seekVersion: 0,
  isBufferingVideo: false,
  currentRoute: { fullname: 'device/route', duration: 10000 },
  loop: null,
});

describe('media playback', () => {
  it('uses the last media position even when wall time or speed changes', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    let state = reducer(defaultState(), videoProgress(1234, 'device/route', 0));
    now.mockReturnValue(100000);
    state = reducer(state, play(2));
    expect(currentOffset(state)).toBe(1234);
    state = reducer(state, bufferVideo(true));
    state = reducer(state, pause());
    expect(currentOffset(state)).toBe(1234);
    expect(state.desiredPlaySpeed).toBe(0);
    now.mockRestore();
  });

  it('distinguishes explicit seek commands from media progress', () => {
    const original = defaultState();
    let state = reducer(original, seek(4000));
    expect(state.seekVersion).toBe(1);
    expect(reducer(state, videoProgress(100, 'device/route', 0))).toBe(state);
    expect(reducer(state, videoProgress(100, 'device/other-route', 1))).toBe(state);
    state = reducer(state, videoProgress(4010, 'device/route', 1));
    expect(state.offset).toBe(4010);
    expect(state.seekVersion).toBe(1);
    state = reducer(state, seek(4010));
    expect(state.seekVersion).toBe(2);
  });

  it('clamps explicit seeks to loops including a loop starting at zero', () => {
    let state = reducer(defaultState(), selectLoop(0, 2000));
    state = reducer(state, seek(-1000));
    expect(state.offset).toBe(0);
    state = reducer(state, seek(3000));
    expect(state.offset).toBe(2000);
    state = reducer(state, selectLoop(1000, 2000));
    state = reducer(state, seek(0));
    expect(state.offset).toBe(1000);
  });

  it('keeps actual progress authoritative at a loop boundary', () => {
    const state = reducer(defaultState(), selectLoop(0, 2000));
    const progress = reducer(state, videoProgress(2050, 'device/route', state.seekVersion || 0));
    expect(progress.offset).toBe(2050);
    expect(currentOffset(progress)).toBe(2050);
  });

  it('handles late video-start metadata and invalid ranges without negative loops', () => {
    const state = { ...defaultState(), currentRoute: { fullname: 'device/route', videoStartOffset: 3000, duration: 10000 } };
    const loop = reducer(state, selectLoop(0, 1000));
    expect(loop.loop.duration).toBe(1000);
    expect(loop.offset).toBe(3000);
    expect(reducer(loop, selectLoop(1000, 1000)).loop).toBeNull();
    expect(reducer(state, seek(NaN))).toBe(state);
    expect(reducer(state, videoProgress(NaN, 'device/route', 0))).toBe(state);
    expect(reducer(state, play(-1))).toBe(state);
  });

  it('resets to the selected range and invalidates old media updates', () => {
    const state = { ...defaultState(), zoom: { start: 2000, end: 5000 }, offset: 4000, seekVersion: 4 };
    const next = reducer(state, resetPlayback());
    expect(next).toMatchObject({ offset: 2000, seekVersion: 5, desiredPlaySpeed: 1, isBufferingVideo: true });
    expect(reducer(next, videoProgress(4500, 'device/route', 4))).toBe(next);
  });

  it('starts null positions at zero or the selected range', () => {
    expect(currentOffset({ offset: null, loop: null })).toBe(0);
    expect(currentOffset({ offset: null, loop: { startTime: 0 } })).toBe(0);
    expect(currentOffset({ offset: null, loop: { startTime: 1000 } })).toBe(1000);
  });
});
