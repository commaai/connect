import { pause, play, reducer, resetPlayback, seek, selectLoop, setPlaybackSpeed, videoProgress } from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1,
    isPlaying: true,
    offset: 0, // in miliseconds from the route start
    seekRequest: null,
    loop: null,
  };
};

describe('playback', () => {
  it('has playback controls that do not move the clock', () => {
    let state = { ...makeDefaultStruct(), offset: 5000 };

    state = reducer(state, pause());
    expect(state.isPlaying).toEqual(false);
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.offset).toEqual(5000);

    state = reducer(state, setPlaybackSpeed(0.5));
    expect(state.isPlaying).toEqual(false);
    expect(state.desiredPlaySpeed).toEqual(0.5);

    state = reducer(state, play());
    expect(state.isPlaying).toEqual(true);
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.offset).toEqual(5000);
    expect(state.seekRequest).toEqual(null);
  });

  it('publishes video progress without requesting a seek', () => {
    let state = makeDefaultStruct();
    state = reducer(state, videoProgress(1234));
    expect(state.offset).toEqual(1234);
    expect(state.seekRequest).toEqual(null);
  });

  it('requests a new seek every time, even to the same offset', () => {
    let state = makeDefaultStruct();
    state = reducer(state, seek(123));
    const first = state.seekRequest;
    expect(state.offset).toEqual(123);
    expect(first).toEqual({ offset: 123 });

    state = reducer(state, seek(123));
    expect(state.seekRequest).toEqual({ offset: 123 });
    expect(state.seekRequest).not.toBe(first);
  });

  it('should clamp loop when seeked after loop end time', () => {
    let state = makeDefaultStruct();
    state = reducer(state, selectLoop(1000, 2000));
    expect(state.loop).toEqual({ startTime: 1000, duration: 1000 });

    state = reducer(state, seek(3000));
    expect(state.offset).toEqual(2000);
    expect(state.seekRequest).toEqual({ offset: 2000 });
  });

  it('should clamp loop when seeked before loop start time', () => {
    let state = makeDefaultStruct();
    state = reducer(state, selectLoop(1000, 2000));

    state = reducer(state, seek(0));
    expect(state.offset).toEqual(1000);
    expect(state.seekRequest).toEqual({ offset: 1000 });
  });

  it('resets to the loop start at normal speed, keeping play state', () => {
    let state = makeDefaultStruct();
    state = reducer(state, selectLoop(1000, 2000));
    state = reducer(state, setPlaybackSpeed(4));
    state = reducer(state, pause());
    state = reducer(state, videoProgress(1500));

    state = reducer(state, resetPlayback());
    expect(state.isPlaying).toEqual(false);
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.offset).toEqual(1000);
    expect(state.seekRequest).toEqual({ offset: 1000 });
  });

  it('clears the loop', () => {
    let state = makeDefaultStruct();
    state = reducer(state, selectLoop(1000, 2000));
    state = reducer(state, selectLoop(null, null));
    expect(state.loop).toEqual(null);
  });
});
