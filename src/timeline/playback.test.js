import { currentOffset } from '.';
import { bufferVideo, pause, play, reducer, seek, selectLoop, videoTime } from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed
    offset: 0, // in miliseconds from the start
    startTime: Date.now(), // seek token: bumped on user-initiated jumps

    isBufferingVideo: false,
  };
};

// make Date.now super stable for tests
let mostRecentNow = Date.now();
const oldNow = Date.now;
Date.now = function now() {
  return mostRecentNow;
};
function newNow() {
  mostRecentNow = oldNow();
  return mostRecentNow;
}

describe('playback', () => {
  it('has playback controls', () => {
    newNow();
    let state = makeDefaultStruct();

    // pause sets desiredPlaySpeed to 0
    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    // play re-anchors from the current position and sets the speed
    state = reducer(state, play());
    expect(state.desiredPlaySpeed).toEqual(1);

    // the clock does NOT advance on its own from wall-clock time
    // (the video drives state, not a virtual timer)
    expect(currentOffset(state)).toEqual(0);

    // changing speed does not change position
    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(currentOffset(state)).toEqual(0);

    // video reports progress -> offset follows the element, no token bump
    const tokenBefore = state.startTime;
    state = reducer(state, videoTime(1234));
    expect(state.offset).toEqual(1234);
    expect(state.startTime).toEqual(tokenBefore);
    expect(currentOffset(state)).toEqual(1234);

    // seek! sets the target and bumps the seek token
    newNow();
    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);
    expect(state.startTime).toEqual(Date.now());
    expect(currentOffset(state)).toEqual(123);
  });

  it('should clamp loop when seeked after loop end time', () => {
    newNow();
    let state = makeDefaultStruct();

    // set up loop
    state = reducer(state, play());
    state = reducer(state, selectLoop(
      1000,
      2000,
    ));
    expect(state.loop.startTime).toEqual(1000);

    // seek past loop end boundary a
    state = reducer(state, seek(3000));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(2000);
  });

  it('should clamp loop when seeked before loop start time', () => {
    newNow();
    let state = makeDefaultStruct();

    // set up loop
    state = reducer(state, play());
    state = reducer(state, selectLoop(
      1000,
      2000,
    ));
    expect(state.loop.startTime).toEqual(1000);

    // seek past loop end boundary a
    state = reducer(state, seek(0));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(1000);
  });

  it('should buffer video and data', async () => {
    newNow();
    let state = makeDefaultStruct();

    state = reducer(state, play());
    expect(state.desiredPlaySpeed).toEqual(1);

    // claim the video is buffering
    state = reducer(state, bufferVideo(true));
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.isBufferingVideo).toEqual(true);

    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.isBufferingVideo).toEqual(true);

    expect(state.desiredPlaySpeed).toEqual(0.5);

    state = reducer(state, play(2));
    state = reducer(state, bufferVideo(false));
    expect(state.desiredPlaySpeed).toEqual(2);
    expect(state.isBufferingVideo).toEqual(false);

    expect(state.desiredPlaySpeed).toEqual(2);
  });

  it('clamps the video-reported position into the loop without bumping the seek token', () => {
    newNow();
    let state = makeDefaultStruct();

    state = reducer(state, selectLoop(1000, 2000));
    const token = state.startTime;

    // inside the loop: passes through untouched
    state = reducer(state, videoTime(1500));
    expect(state.offset).toEqual(1500);
    expect(state.startTime).toEqual(token);

    // past the loop end: clamped to the end, token still unchanged
    state = reducer(state, videoTime(5000));
    expect(state.offset).toEqual(2000);
    expect(state.startTime).toEqual(token);
  });
});
