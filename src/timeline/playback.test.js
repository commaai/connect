import { asyncSleep } from '../utils';
import { currentOffset } from '.';
import { bufferVideo, pause, play, reducer, seek, selectLoop, videoTick } from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed
    offset: 0, // in miliseconds from the start
    startTime: Date.now(), // millisecond timestamp in which play began

    isBuffering: true,
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
  it('has playback controls', async () => {
    newNow();
    let state = makeDefaultStruct();

    // should do nothing
    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    // start playing, should set start time and such
    let playTime = newNow();
    state = reducer(state, play());
    // this is a (usually 1ms) race condition
    expect(state.startTime).toEqual(playTime);
    expect(state.desiredPlaySpeed).toEqual(1);

    await asyncSleep(100 + Math.random() * 200);
    // should update offset
    let ellapsed = newNow() - playTime;
    state = reducer(state, pause());

    expect(state.offset).toEqual(ellapsed);

    // start playing, should set start time and such
    playTime = newNow();
    state = reducer(state, play(0.5));
    // this is a (usually 1ms) race condition
    expect(state.startTime).toEqual(playTime);
    expect(state.desiredPlaySpeed).toEqual(0.5);

    await asyncSleep(100 + Math.random() * 200);
    // should update offset, playback speed 1/2
    ellapsed += (newNow() - playTime) / 2;
    expect(currentOffset(state)).toEqual(ellapsed);
    state = reducer(state, pause());

    expect(state.offset).toEqual(ellapsed);

    // seek!
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

  it('wraps a loop that starts at zero', () => {
    newNow();
    let state = makeDefaultStruct();

    state = reducer(state, play());
    state = reducer(state, selectLoop(0, 2000));
    expect(state.loop.startTime).toEqual(0);

    // a tick past the end wraps instead of running away
    state = reducer(state, videoTick(2500));
    expect(state.offset).toEqual(500);

    // currentOffset honors the zero-start loop too
    expect(currentOffset({ ...state, offset: 2500, startTime: Date.now() })).toEqual(500);

    // user seeks clamp (not wrap) at the edges
    state = reducer(state, seek(3000));
    expect(state.offset).toEqual(2000);
    state = reducer(state, seek(-100));
    expect(state.offset).toEqual(0);
  });

  it('records player observations without counting them as seeks', () => {
    newNow();
    let state = makeDefaultStruct();

    state = reducer(state, play());
    state = reducer(state, videoTick(4000));
    expect(state.offset).toEqual(4000);
    expect(currentOffset(state)).toEqual(4000);

    // while paused the player position still wins (no wall-clock drift)
    state = reducer(state, pause());
    state = reducer(state, videoTick(4500));
    expect(state.offset).toEqual(4500);
  });
});
