import { vi } from 'vitest';
import { currentOffset, registerVideoClock } from '.';
import { bufferVideo, pause, play, reducer, resetPlayback, seek, selectLoop, videoProgress } from './playback';

const initial = () => ({
  desiredPlaySpeed: 1, offset: 0, seekVersion: 0, isBufferingVideo: false,
  currentRoute: { fullname: 'route', duration: 60000 },
});

describe('media-driven playback', () => {
  it('never advances position using elapsed wall time', () => {
    const state = reducer(initial(), videoProgress('route', 1234));
    vi.spyOn(Date, 'now').mockReturnValue(9999999999999);
    expect(currentOffset(state)).toBe(1234);
    expect(reducer(state, pause()).offset).toBe(1234);
    expect(reducer(state, play(2)).offset).toBe(1234);
    expect(reducer(state, bufferVideo(true)).offset).toBe(1234);
    vi.restoreAllMocks();
  });

  it('separates explicit seek requests from media progress', () => {
    let state = reducer(initial(), seek(10000));
    expect(state).toMatchObject({ offset: 10000, seekVersion: 1 });
    state = reducer(state, videoProgress('route', 10200, 1));
    expect(state).toMatchObject({ offset: 10200, seekVersion: 1 });
    expect(reducer(state, videoProgress('old route', 20000))).toBe(state);
    expect(reducer(state, videoProgress('route', 9000, 0))).toBe(state);
    expect(reducer(state, seek(NaN))).toBe(state);
  });

  it('clamps seeks to zero-start loops and the video origin', () => {
    let state = reducer(initial(), selectLoop(0, 2000));
    expect(reducer(state, seek(3000)).offset).toBe(2000);
    expect(reducer(state, seek(-1000)).offset).toBe(0);
    state.currentRoute.videoStartOffset = 500;
    expect(reducer(state, seek(0)).offset).toBe(500);
    expect(state.loop).toEqual({ startTime: 0, duration: 2000 });
  });

  it('seeks when changing the selection and rejects empty loops', () => {
    let state = reducer(initial(), selectLoop(10000, 20000));
    expect(state).toMatchObject({ offset: 10000, seekVersion: 1 });
    expect(reducer(state, seek(30000)).offset).toBe(20000);
    state = reducer(state, selectLoop(10000, 10000));
    expect(state.loop).toBeNull();
    expect(currentOffset({ offset: null, loop: { startTime: 0 } })).toBe(0);
  });

  it('resets playback to the current selection', () => {
    const state = reducer({ ...initial(), desiredPlaySpeed: 0, zoom: { start: 10000 } }, resetPlayback());
    expect(state).toMatchObject({ desiredPlaySpeed: 1, offset: 10000, isBufferingVideo: true, seekVersion: 1 });
  });

  it('reads the media clock directly and unregisters only its own source', () => {
    const removeOld = registerVideoClock(() => 1000);
    const removeNew = registerVideoClock(() => 2000);
    expect(currentOffset()).toBe(2000);
    removeOld();
    expect(currentOffset()).toBe(2000);
    removeNew();
  });
});
