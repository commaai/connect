/* eslint-env jest */
import {
  bufferVideo,
  reducer,
  resetPlayback,
  seek,
  selectLoop,
  setPlaybackSpeed,
} from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed
    offset: 0, // in miliseconds from the start
    startTime: Date.now(), // millisecond timestamp in which play began

    isBuffering: true,
  };
};

describe('playback', () => {
  it('has playback controls', () => {
    let state = makeDefaultStruct();

    // stop playback
    state = reducer(state, setPlaybackSpeed(0));
    expect(state.desiredPlaySpeed).toEqual(0);

    // start playing
    state = reducer(state, setPlaybackSpeed(1));
    expect(state.desiredPlaySpeed).toEqual(1);

    // seek updates offset
    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);

    // reset clears offset
    state = reducer(state, resetPlayback());
    expect(state.offset).toEqual(0);
  });

  it('should set loop start time and duration', () => {
    let state = makeDefaultStruct();

    state = reducer(state, selectLoop(
      1000,
      2000,
    ));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.loop.duration).toEqual(1000);
  });

  it('should not clamp offset when seeked after loop end time', () => {
    let state = makeDefaultStruct();

    state = reducer(state, selectLoop(
      1000,
      2000,
    ));
    expect(state.loop.startTime).toEqual(1000);

    state = reducer(state, seek(3000));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(3000);
  });

  it('should not clamp offset when seeked before loop start time', () => {
    let state = makeDefaultStruct();

    state = reducer(state, selectLoop(
      1000,
      2000,
    ));
    expect(state.loop.startTime).toEqual(1000);

    state = reducer(state, seek(0));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(0);
  });

  it('should buffer video and data', () => {
    let state = makeDefaultStruct();

    state = reducer(state, setPlaybackSpeed(1));
    expect(state.desiredPlaySpeed).toEqual(1);

    // claim the video is buffering
    state = reducer(state, bufferVideo(true));
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.isBufferingVideo).toEqual(true);

    state = reducer(state, setPlaybackSpeed(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.isBufferingVideo).toEqual(true);

    state = reducer(state, setPlaybackSpeed(2));
    state = reducer(state, bufferVideo(false));
    expect(state.desiredPlaySpeed).toEqual(2);
    expect(state.isBufferingVideo).toEqual(false);
  });
});
