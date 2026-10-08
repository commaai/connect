import { attachVideo, currentOffset } from '.';
import { pause, play, reducer, resetPlayback, seek, selectLoop } from './playback';

const makeDefaultStruct = () => ({
  desiredPlaySpeed: 1,
  offset: 0,
  seekTime: 0,
  loop: null,
  currentRoute: null,
});

describe('playback', () => {
  afterEach(() => attachVideo(null));

  it('has playback controls', () => {
    let state = makeDefaultStruct();

    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);

    // play and pause leave the position to the video
    expect(state.offset).toEqual(0);

    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);
    expect(state.seekTime).toBeGreaterThan(0);
    expect(currentOffset(state)).toEqual(123);
  });

  it('updates seekTime when seeking to the same offset', () => {
    let state = reducer(makeDefaultStruct(), seek(123));
    const { seekTime } = state;
    state = reducer({ ...state, seekTime: seekTime - 1 }, seek(123));
    expect(state.seekTime).toBeGreaterThan(seekTime - 1);
  });

  it('should clamp loop when seeked after loop end time', () => {
    let state = reducer(makeDefaultStruct(), selectLoop(1000, 2000));
    state = reducer(state, seek(3000));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(2000);
  });

  it('should clamp loop when seeked before loop start time', () => {
    let state = reducer(makeDefaultStruct(), selectLoop(1000, 2000));
    state = reducer(state, seek(0));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(1000);
  });

  it('reset starts playing from the start of the loop', () => {
    let state = reducer({ ...makeDefaultStruct(), desiredPlaySpeed: 0, offset: 5000 }, resetPlayback());
    state = reducer(state, selectLoop(1000, 2000));
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.offset).toEqual(1000);
  });

  it('reads the offset from the video once it has loaded', () => {
    const state = { ...makeDefaultStruct(), offset: 5000, currentRoute: { videoStartOffset: 1500 } };
    const video = { readyState: HTMLMediaElement.HAVE_NOTHING, currentTime: 0 };
    attachVideo(video);
    expect(currentOffset(state)).toEqual(5000);

    video.readyState = HTMLMediaElement.HAVE_METADATA;
    video.currentTime = 10;
    expect(currentOffset(state)).toEqual(11500);
  });

  it('keeps the video offset inside the loop', () => {
    const state = reducer(makeDefaultStruct(), selectLoop(1000, 2000));
    attachVideo({ readyState: HTMLMediaElement.HAVE_ENOUGH_DATA, currentTime: 3 });
    expect(currentOffset(state)).toEqual(2000);
  });
});
