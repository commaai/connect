import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';

import { currentOffset, setVideo } from '.';
import {
  pause, play, reducer, resetPlayback, seek, selectLoop, setPlaybackSpeed, videoPlayed,
} from './playback';

function makeStore() {
  return createStore(reducer, {
    currentRoute: { videoStartOffset: 2000 },
    desiredPlaySpeed: 1,
    isPlaying: false,
    offset: null,
    loop: null,
    zoom: { start: 0, end: 60000 },
  }, applyMiddleware(thunk));
}

function makeVideo() {
  const video = { currentTime: 0, readyState: HTMLMediaElement.HAVE_NOTHING, play: vi.fn(async () => {}), pause: vi.fn() };
  setVideo(video);
  return video;
}

describe('playback', () => {
  afterEach(() => setVideo(null));

  it('seeks the video within the loop', () => {
    const store = makeStore();
    const video = makeVideo();

    store.dispatch(seek(12000));
    expect(store.getState().offset).toEqual(12000);
    expect(video.currentTime).toEqual(10);

    // before the first camera frame
    store.dispatch(seek(1000));
    expect(video.currentTime).toEqual(0);

    store.dispatch(selectLoop(20000, 30000));
    expect(store.getState().loop).toEqual({ startTime: 20000, duration: 10000 });
    store.dispatch(seek(35000));
    expect(store.getState().offset).toEqual(30000);
    store.dispatch(seek(0));
    expect(store.getState().offset).toEqual(20000);

    store.dispatch(selectLoop(null, null));
    expect(store.getState().loop).toBeNull();
  });

  it('reads the position from the video once it has loaded', () => {
    const store = makeStore();
    store.dispatch(selectLoop(20000, 30000));
    expect(currentOffset(store.getState())).toEqual(20000);

    // without a video, seeking still moves the position
    store.dispatch(seek(25000));
    expect(currentOffset(store.getState())).toEqual(25000);

    const video = makeVideo();
    expect(currentOffset(store.getState())).toEqual(25000);
    video.readyState = HTMLMediaElement.HAVE_METADATA;
    video.currentTime = 20;
    expect(currentOffset(store.getState())).toEqual(22000);

    // past the video's end, where the browser stops it, the position is where it was sent
    video.duration = 25;
    store.dispatch(seek(29000));
    video.currentTime = 25;
    expect(currentOffset(store.getState())).toEqual(29000);

    // also before anything stored a position, e.g. a link past the end that couldn't autoplay
    expect(currentOffset({ ...store.getState(), offset: null, loop: null, zoom: { start: 40000, end: 50000 } })).toEqual(40000);

    // and when the end moves on a little after the browser stopped the video there, as Safari's does
    video.duration = 25.1;
    expect(currentOffset(store.getState())).toEqual(29000);
  });

  it('leaves play, pause and speed to the video', () => {
    const store = makeStore();
    const video = makeVideo();

    store.dispatch(play());
    store.dispatch(pause());
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(store.getState().isPlaying).toBe(false);

    // without starting playback
    store.dispatch(setPlaybackSpeed(4));
    expect(store.getState().desiredPlaySpeed).toEqual(4);
    expect(video).toMatchObject({ defaultPlaybackRate: 4, playbackRate: 4 });
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('resets for a new drive', () => {
    const store = makeStore();
    store.dispatch(setPlaybackSpeed(4));
    store.dispatch(videoPlayed(1234));

    store.dispatch(resetPlayback());
    expect(store.getState()).toMatchObject({ desiredPlaySpeed: 1, isPlaying: false, offset: null });
  });
});
