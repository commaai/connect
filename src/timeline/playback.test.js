import {
  setVideoStatus,
  VideoStatus,
  pause,
  play,
  videoProgress,
  reducer,
  resetPlayback,
  seek,
  selectLoop,
  setPlaybackSpeed,
} from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1,
    videoStatus: VideoStatus.LOADING,
    isPlaying: true,
    offset: 0, // in miliseconds from the start
    hasAudio: false,
  };
};

describe('playback', () => {
  it('has playback controls', () => {
    let state = makeDefaultStruct();

    // stop playback
    state = reducer(state, pause());
    expect(state.isPlaying).toBe(false);
    expect(state.desiredPlaySpeed).toBe(1);

    // start playing
    state = reducer(state, play());
    expect(state.isPlaying).toBe(true);

    // seek updates offset
    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);

    const seekRequest = state.seekRequest;
    state = reducer(state, videoProgress(456));
    expect(state.offset).toBe(456);
    expect(state.seekRequest).toBe(seekRequest);

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

  it('keeps the chosen speed during buffering', () => {
    let state = makeDefaultStruct();

    state = reducer(state, play());
    expect(state.isPlaying).toBe(true);

    // claim the video is buffering
    state = reducer(state, setVideoStatus(VideoStatus.LOADING));
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.videoStatus).toBe(VideoStatus.LOADING);

    state = reducer(state, setPlaybackSpeed(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.videoStatus).toBe(VideoStatus.LOADING);

    state = reducer(state, setPlaybackSpeed(2));
    state = reducer(state, setVideoStatus(VideoStatus.READY));
    expect(state.desiredPlaySpeed).toEqual(2);
    expect(state.videoStatus).toBe(VideoStatus.READY);
  });
});
