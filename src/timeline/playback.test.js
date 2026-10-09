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
    expect(state.isPlaying).toEqual(false);

    // changing speed doesn't resume
    state = reducer(state, setPlaybackSpeed(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.isPlaying).toEqual(false);

    state = reducer(state, play());
    expect(state.isPlaying).toEqual(true);
    expect(state.desiredPlaySpeed).toEqual(0.5);

    // seek!
    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);

    state = reducer(state, pause());
    state = reducer(state, resetPlayback());
    expect(state).toMatchObject({ isPlaying: true, desiredPlaySpeed: 1, offset: 0 });
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

  it('starts a range link at its start', () => {
    const state = reducer({ ...makeDefaultStruct(), offset: null }, selectLoop(300000, 320000));
    expect(state.offset).toEqual(300000);
  });

  it('keeps the seek request when the video reports its position', () => {
    let state = reducer(makeDefaultStruct(), seek(1000));
    const { seekRequest } = state;
    state = reducer(state, videoProgress(1500));
    expect(state.offset).toEqual(1500);
    expect(state.seekRequest).toBe(seekRequest);
  });

  it('keeps a seek request inside the loop', () => {
    const state = reducer({ ...makeDefaultStruct(), loop: { startTime: 5000, duration: 2000 } }, seek(1000));
    expect(state.seekRequest.offset).toEqual(5000);
  });
});
