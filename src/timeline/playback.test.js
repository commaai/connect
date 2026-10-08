import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';

import { currentOffset, setVideo, videoTime } from '.';
import { bufferVideo, pause, play, reducer, resetPlayback, seek, selectLoop } from './playback';

// the video starts 2s into the drive
const currentRoute = { videoStartOffset: 2000 };

// the clock only touches readyState and currentTime, so a plain object stands in for the <video>
function setup(video = null) {
  setVideo(video);
  const store = createStore(reducer, {
    desiredPlaySpeed: 1,
    isBufferingVideo: true,
    offset: null,
    loop: null,
    currentRoute,
  }, applyMiddleware(thunk));
  return { store, offset: () => currentOffset(store.getState()) };
}

describe('playback', () => {
  afterEach(() => setVideo(null));

  it('maps drive offsets to video time', () => {
    expect(videoTime(12000, currentRoute)).toEqual(10);
    expect(videoTime(1000, currentRoute)).toEqual(0);
    expect(videoTime(12000, {})).toEqual(12);
  });

  it('follows the video', () => {
    const video = { readyState: 4, currentTime: 10 };
    const { offset } = setup(video);
    expect(offset()).toEqual(12000);

    video.currentTime = 10.5;
    expect(offset()).toEqual(12500);
  });

  it('seeks the video', () => {
    const video = { readyState: 4, currentTime: 0 };
    const { store, offset } = setup(video);

    store.dispatch(seek(32000));
    expect(video.currentTime).toEqual(30);
    expect(offset()).toEqual(32000);

    // the drive starts before the video does
    store.dispatch(seek(0));
    expect(video.currentTime).toEqual(0);
    expect(offset()).toEqual(2000);
  });

  it('holds a position until the video has loaded', () => {
    const video = { readyState: 0, currentTime: 0 };
    const { store, offset } = setup(video);
    expect(offset()).toEqual(0);

    store.dispatch(selectLoop(10000, 20000));
    expect(offset()).toEqual(10000);

    store.dispatch(seek(15000));
    expect(video.currentTime).toEqual(0);
    expect(offset()).toEqual(15000);
  });

  it('should clamp loop when seeked after loop end time', () => {
    const { store } = setup();
    store.dispatch(selectLoop(1000, 2000));
    store.dispatch(seek(3000));
    expect(store.getState().offset).toEqual(2000);
  });

  it('should clamp loop when seeked before loop start time', () => {
    const { store } = setup();
    store.dispatch(selectLoop(1000, 2000));
    store.dispatch(seek(0));
    expect(store.getState().offset).toEqual(1000);
  });

  it('has playback controls', () => {
    const { store } = setup({ readyState: 4, currentTime: 10 });

    store.dispatch(pause());
    expect(store.getState()).toMatchObject({ desiredPlaySpeed: 0, offset: 12000 });

    store.dispatch(play(0.5));
    expect(store.getState().desiredPlaySpeed).toEqual(0.5);

    store.dispatch(bufferVideo(false));
    expect(store.getState().isBufferingVideo).toEqual(false);

    store.dispatch(resetPlayback());
    expect(store.getState()).toMatchObject({ desiredPlaySpeed: 1, isBufferingVideo: true, offset: null });
  });
});
