import { clampToLoop, currentOffset, setVideoClock } from '.';
import { pause, play, reducer, resetPlayback, seek, selectLoop } from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed
    offset: null, // last requested position, in miliseconds from the start
    seekId: 0,
  };
};

describe('playback', () => {
  afterEach(() => setVideoClock(null));

  it('has playback controls', () => {
    let state = makeDefaultStruct();

    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);

    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);
    expect(state.seekId).toEqual(1);
    expect(state.desiredPlaySpeed).toEqual(0.5);
  });

  it('should clamp loop when seeked after loop end time', () => {
    let state = reducer(makeDefaultStruct(), selectLoop(1000, 2000));
    expect(state.loop.startTime).toEqual(1000);

    state = reducer(state, seek(3000));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(2000);
  });

  it('should clamp loop when seeked before loop start time', () => {
    let state = reducer(makeDefaultStruct(), selectLoop(1000, 2000));

    state = reducer(state, seek(0));
    expect(state.offset).toEqual(1000);
  });

  it('keeps a loop that starts at 0', () => {
    const loop = { startTime: 0, duration: 1000 };
    expect(clampToLoop(5000, loop)).toEqual(1000);
    expect(clampToLoop(-5, loop)).toEqual(0);
  });

  it('resets to the start of the loop', () => {
    let state = reducer(makeDefaultStruct(), selectLoop(1000, 2000));
    state = reducer(state, seek(1500));
    state = reducer(state, resetPlayback());
    expect(state.offset).toEqual(null);
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(currentOffset(state)).toEqual(1000);
  });

  it('follows the video clock once the video reports a position', () => {
    const state = reducer(makeDefaultStruct(), selectLoop(1000, 3000));
    expect(currentOffset(state)).toEqual(1000);

    setVideoClock(() => 2500);
    expect(currentOffset(state)).toEqual(2500);

    // never reports outside the loop
    setVideoClock(() => 9000);
    expect(currentOffset(state)).toEqual(3000);
  });
});
