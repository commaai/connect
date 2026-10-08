import { currentOffset } from '.';
import { bufferVideo, pause, play, reducer, reportVideoTime, seek, selectLoop } from './playback';

const state = {
  desiredPlaySpeed: 1,
  isBufferingVideo: false,
  offset: 1200,
  seekRevision: 0,
  loop: null,
};

describe('playback state follows the media clock', () => {
  it('uses observed media time without extrapolating from wall clock or speed', () => {
    expect(currentOffset({ ...state, startTime: 0 })).toBe(1200);
    expect(currentOffset({ ...state, desiredPlaySpeed: 8, isBufferingVideo: true })).toBe(1200);
  });

  it('distinguishes progress reports from explicit seeks, including seek to zero', () => {
    const reported = reducer(state, reportVideoTime(1500));
    expect(reported.offset).toBe(1500);
    expect(reported.seekRevision).toBe(0);

    const requested = reducer(reported, seek(0));
    expect(requested.offset).toBe(0);
    expect(requested.seekRevision).toBe(1);
  });

  it('keeps playback controls and buffering from changing observed time', () => {
    const buffered = reducer(state, bufferVideo(true));
    expect(buffered.offset).toBe(state.offset);
    expect(buffered.desiredPlaySpeed).toBe(1);
    expect(reducer(buffered, pause()).desiredPlaySpeed).toBe(0);
    expect(reducer(buffered, play(2)).desiredPlaySpeed).toBe(2);
  });

  it('wraps media progress at loops that start at zero and clamps explicit seeks', () => {
    const looped = reducer({ ...state, offset: 0 }, selectLoop(0, 1000));
    const wrapped = reducer(looped, reportVideoTime(1100));
    expect(wrapped.offset).toBe(0);
    expect(wrapped.seekRevision).toBe(1);

    const clamped = reducer(looped, seek(1200));
    expect(clamped.offset).toBe(1000);
  });
});
