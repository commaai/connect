import { currentOffset } from '.';
import { bufferVideo, pause, play, reducer, seek, selectLoop, videoProgress } from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed
    offset: 0, // in miliseconds from the start
    seekRevision: 0,

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
  it('uses only media observations for progress and keeps explicit seeks independent', () => {
    let state = makeDefaultStruct();
    state = reducer(state, seek(123));
    const rev = state.seekRevision;
    expect(currentOffset(state)).toBe(123);
    mostRecentNow += 30000;
    expect(currentOffset(state)).toBe(123);
    state = reducer(state, play(2));
    expect(currentOffset(state)).toBe(123);
    state = reducer(state, videoProgress(550, rev));
    expect(currentOffset(state)).toBe(550);
    state = reducer(state, seek(900));
    state = reducer(state, videoProgress(600, rev));
    expect(currentOffset(state)).toBe(900);
    state = reducer(state, videoProgress(940, state.seekRevision));
    expect(currentOffset(state)).toBe(940);
    state = reducer(state, pause());
    mostRecentNow += 20000;
    expect(currentOffset(state)).toBe(940);
  });

  it('treats repeated same-position seeks as distinct commands', () => {
    let state = makeDefaultStruct();
    state = reducer(state, seek(250));
    const first = state.seekRevision;
    state = reducer(state, seek(250));
    expect(state.seekRevision).toBe(first + 1);
    state = reducer(state, videoProgress(320, first));
    expect(state.offset).toBe(250);
  });

  it('respects and wraps a loop that starts at zero', () => {
    newNow();
    let state = makeDefaultStruct();
    state = reducer(state, selectLoop(0, 1000));
    state = reducer(state, seek(900));
    expect(currentOffset(state)).toBe(900);
    state = reducer(state, seek(1500));
    expect(state.offset).toBe(1000);
    state = reducer(state, seek(-200));
    expect(state.offset).toBe(0);
    state = { ...state, offset: 2500, isBufferingVideo: true };
    expect(currentOffset(state)).toBe(1000);
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
});
