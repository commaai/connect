import { currentOffset, setPlaybackVideo } from '.';
import { pause, play, reducer, seek, selectLoop, setPlaySpeed } from './playback';

function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1,
    isPlaying: true,
    offset: 0,
    seekRequest: null,
    loop: null,
  };
}

describe('playback', () => {
  afterEach(() => setPlaybackVideo(null));

  it('keeps play, pause, and speed apart', () => {
    let state = makeDefaultStruct();

    state = reducer(state, pause());
    expect(state.isPlaying).toEqual(false);
    expect(state.desiredPlaySpeed).toEqual(1);

    state = reducer(state, setPlaySpeed(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.isPlaying).toEqual(false);

    state = reducer(state, play());
    expect(state.isPlaying).toEqual(true);
    expect(state.desiredPlaySpeed).toEqual(0.5);

    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);
    expect(state.seekRequest).toEqual({ offset: 123 });
    expect(currentOffset(state)).toEqual(123);

    const { seekRequest } = state;
    state = reducer(state, seek(123));
    expect(state.seekRequest).not.toBe(seekRequest);
  });

  it('should clamp loop when seeked after loop end time', () => {
    let state = makeDefaultStruct();
    state = reducer(state, selectLoop(1000, 2000));

    state = reducer(state, seek(3000));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(2000);
  });

  it('should clamp loop when seeked before loop start time', () => {
    let state = makeDefaultStruct();
    state = reducer(state, selectLoop(1000, 2000));

    state = reducer(state, seek(0));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(1000);
  });

  it('follows the video once it has loaded', () => {
    let state = {
      ...makeDefaultStruct(),
      currentRoute: { videoStartOffset: 2000 },
    };
    state = reducer(state, selectLoop(0, 60000));
    state = reducer(state, seek(5000));

    const video = { readyState: HTMLMediaElement.HAVE_NOTHING, currentTime: 0 };
    setPlaybackVideo(video);
    expect(currentOffset(state)).toEqual(5000);

    video.readyState = HTMLMediaElement.HAVE_METADATA;
    video.currentTime = 10;
    expect(currentOffset(state)).toEqual(12000);

    video.currentTime = 100;
    expect(currentOffset(state)).toEqual(60000);

    state = reducer(state, pause());
    expect(state.offset).toEqual(60000);
    setPlaybackVideo(null);
    expect(currentOffset(state)).toEqual(60000);
  });
});
