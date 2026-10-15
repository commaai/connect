import { pause, play, reducer, resetPlayback, seek, selectLoop, setPlaybackSpeed, videoProgress } from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1,
    isPlaying: true,
    offset: 0, // in miliseconds from the start
    seekRequest: null,
  };
};

describe('playback', () => {
  it('has playback controls', () => {
    let state = makeDefaultStruct();

    state = reducer(state, pause());
    state = reducer(state, setPlaybackSpeed(0.5));
    expect(state).toMatchObject({ isPlaying: false, desiredPlaySpeed: 0.5 });
    state = reducer(state, play());
    expect(state).toMatchObject({ isPlaying: true, desiredPlaySpeed: 0.5 });

    // seek!
    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);
    state = reducer(state, videoProgress(456, state.seekRequest));
    expect(state.offset).toEqual(456);
  });

  it('ignores progress from before the latest seek', () => {
    let state = reducer(makeDefaultStruct(), seek(1000));
    const { seekRequest } = state;
    state = reducer(state, seek(5000));
    state = reducer(state, videoProgress(1100, seekRequest));
    expect(state.offset).toEqual(5000);
  });

  it('should clamp loop when seeked after loop end time', () => {
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

  it('moves into a new loop and resets per route', () => {
    let state = reducer({ ...makeDefaultStruct(), offset: 500 }, selectLoop(1000, 2000));
    expect(state.offset).toEqual(1000);
    expect(state.seekRequest).not.toBeNull();

    state = reducer({ ...state, desiredPlaySpeed: 4, isPlaying: false }, resetPlayback());
    expect(state).toMatchObject({ offset: 1000, seekRequest: null, desiredPlaySpeed: 1, isPlaying: true });
  });
});
