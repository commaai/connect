import { currentOffset } from '.';
import { bufferVideo, pause, play, reducer, seek, selectLoop, progress, mediaSource, resetPlayback } from './playback';

const initial = () => ({ desiredPlaySpeed: 1, offset: 0, seekRevision: 0 });

describe('media-owned playback', () => {
  it('does not extrapolate a second clock while playing or buffering', () => {
    const state = { ...initial(), offset: 123, startTime: 0, isBufferingVideo: false };
    expect(currentOffset(state)).toBe(123);
    expect(currentOffset(reducer(state, pause()))).toBe(123);
    expect(currentOffset(reducer(state, play(2)))).toBe(123);
    expect(currentOffset(reducer(state, bufferVideo(true)))).toBe(123);
  });

  it('uses zero-start loop fallback when no observation exists', () => {
    expect(currentOffset({ offset: null, loop: { startTime: 0, duration: 1000 } })).toBe(0);
    expect(currentOffset({ offset: null, loop: { startTime: 500, duration: 1000 } })).toBe(500);
  });

  it('separates observations from repeated explicit seek commands', () => {
    let state = reducer(initial(), mediaSource('A'));
    state = reducer(state, seek(1));
    expect(state).toMatchObject({ offset: 1, seekOffset: 1, seekRevision: 1 });
    state = reducer(state, seek(1));
    expect(state.seekRevision).toBe(2);
    expect(reducer(state, progress('A', 1, 100))).toBe(state);
    expect(reducer(state, progress('old', 2, 100))).toBe(state);
    const sampled = reducer(state, progress('A', 2, 100));
    expect(sampled).toMatchObject({ offset: 100, seekOffset: 1, seekRevision: 2 });
    expect(reducer(sampled, progress('A', 2, 100))).toBe(sampled);
  });

  it('clamps explicit seeks at both loop edges including zero', () => {
    let state = reducer(initial(), selectLoop(0, 1000));
    state = reducer(state, seek(-1));
    expect(state.offset).toBe(0);
    state = reducer(state, seek(2000));
    expect(state.offset).toBe(1000);
    expect(reducer(state, seek(NaN))).toBe(state);
    expect(reducer(state, seek(Infinity))).toBe(state);
  });

  it('validates speed and range without advancing time', () => {
    const state = initial();
    expect(reducer(state, play(NaN))).toBe(state);
    expect(reducer(state, play(-1))).toBe(state);
    expect(reducer(state, play(100)).desiredPlaySpeed).toBe(16);
    expect(reducer(state, selectLoop(10, 10)).loop).toBeNull();
    expect(reducer(state, selectLoop(-1, 10)).loop).toBeNull();
  });

  it('resets to the selected range with a fresh command revision', () => {
    const state = reducer({ ...initial(), zoom: { start: 10100, end: 10900 } }, resetPlayback());
    expect(state).toMatchObject({ offset: 10100, seekOffset: 10100, seekRevision: 1 });
  });
});
