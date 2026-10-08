import { asyncSleep } from '../utils';
import { currentOffset } from '.';
import { bufferVideo, pause, play, reducer, resetPlayback, seek, selectLoop, syncPlayhead } from './playback';

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

  it('commands the video to go where a seek, a reset, or a new loop puts the playhead', () => {
    newNow();
    let state = makeDefaultStruct();
    expect(state.seekTo).toBeUndefined();

    state = reducer(state, seek(5000));
    expect(state.seekTo).toEqual({ offset: 5000 });

    const first = state.seekTo;
    state = reducer(state, seek(5000));
    expect(state.seekTo).not.toBe(first); // seeking to the same place is still a seek

    state = reducer(state, selectLoop(10000, 20000));
    expect(state.seekTo).toEqual({ offset: 10000 }); // the playhead was outside it

    state = reducer(state, seek(30000));
    expect(state.seekTo).toEqual({ offset: 20000 }); // clamped to the loop

    state = reducer(state, resetPlayback());
    expect(state.seekTo).toEqual({ offset: 0 });
  });

  it('does not command the video when playback changes without moving the playhead', () => {
    newNow();
    let state = reducer(makeDefaultStruct(), seek(12000));
    const { seekTo } = state;

    state = reducer(state, selectLoop(10000, 20000)); // already inside it
    state = reducer(state, play(2));
    state = reducer(state, pause());
    state = reducer(state, bufferVideo(true));
    state = reducer(state, bufferVideo(false, 12500));
    state = reducer(state, syncPlayhead(12600));
    expect(state.seekTo).toBe(seekTo);
  });

  it('takes the playhead from the video when it says where it is', () => {
    newNow();
    let state = makeDefaultStruct();

    state = reducer(state, bufferVideo(true, 4321));
    expect(state.offset).toEqual(4321);
    expect(state.startTime).toEqual(Date.now());

    state = reducer(state, syncPlayhead(8765));
    expect(state.offset).toEqual(8765);
    expect(state.startTime).toEqual(Date.now());
  });
});
