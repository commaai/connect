import * as Types from '../actions/types';
import store from '../store';
import { asyncSleep } from '../utils';
import { currentOffset, setVideo, videoReady } from '.';
import { pause, play, reducer, seek, selectLoop } from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed
    offset: 0, // in miliseconds from the start
    startTime: Date.now(), // millisecond timestamp in which play began
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
  it('has playback controls', async () => {
    newNow();
    let state = makeDefaultStruct();

    // should do nothing
    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    // start playing, should set start time and such
    let playTime = newNow();
    state = reducer(state, play());
    // this is a (usually 1ms) race condition
    expect(state.startTime).toEqual(playTime);
    expect(state.desiredPlaySpeed).toEqual(1);

    await asyncSleep(100 + Math.random() * 200);
    // should update offset
    let ellapsed = newNow() - playTime;
    state = reducer(state, pause());

    expect(state.offset).toEqual(ellapsed);

    // start playing, should set start time and such
    playTime = newNow();
    state = reducer(state, play(0.5));
    // this is a (usually 1ms) race condition
    expect(state.startTime).toEqual(playTime);
    expect(state.desiredPlaySpeed).toEqual(0.5);

    await asyncSleep(100 + Math.random() * 200);
    // should update offset, playback speed 1/2
    ellapsed += (newNow() - playTime) / 2;
    expect(currentOffset(state)).toEqual(ellapsed);
    state = reducer(state, pause());

    expect(state.offset).toEqual(ellapsed);

    // seek!
    newNow();
    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);
    expect(state.startTime).toEqual(Date.now());
    expect(currentOffset(state)).toEqual(123);
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
});

describe('video clock', () => {
  const fakeVideo = () => ({
    currentTime: 0,
    paused: true,
    playbackRate: 1,
    play: vi.fn(function videoPlay() { this.paused = false; return Promise.resolve(); }),
    pause: vi.fn(function videoPause() { this.paused = true; }),
  });

  beforeEach(() => {
    newNow();
    // a route whose video starts 2 s after its logs
    store.dispatch({
      type: Types.ACTION_ROUTES_METADATA,
      routes: [{ log_id: 'r', fullname: 'x|r', duration: 60000, videoStartOffset: 2000 }],
    });
    store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 'r', start: 0, end: 60000 });
    store.dispatch(seek(5000));
  });

  afterEach(() => setVideo(null));

  it('holds the start position until the video has metadata, then moves the video there', () => {
    const video = fakeVideo();
    setVideo(video);
    store.dispatch(seek(30000));
    newNow();
    expect(currentOffset()).toEqual(30000);
    expect(video.currentTime).toEqual(0);

    videoReady();
    expect(video.currentTime).toEqual(28);
  });

  it('reads time from the video and sends seeks, plays and pauses to it', () => {
    const video = fakeVideo();
    setVideo(video);
    videoReady();

    video.currentTime = 40;
    expect(currentOffset()).toEqual(42000);

    store.dispatch(pause());
    expect(video.pause).toHaveBeenCalled();
    expect(store.getState().offset).toEqual(42000);

    store.dispatch(play(2));
    expect(video.playbackRate).toEqual(2);
    expect(video.play).toHaveBeenCalled();

    store.dispatch(seek(10000));
    expect(video.currentTime).toEqual(8);

    // logs start before the video: clamp to its first frame
    store.dispatch(seek(500));
    expect(video.currentTime).toEqual(0);
  });

  it('hands the clock back to Redux where the video stopped', () => {
    const video = fakeVideo();
    setVideo(video);
    videoReady();
    video.currentTime = 20;
    store.dispatch(pause());

    setVideo(null);
    video.currentTime = 50;
    expect(store.getState().offset).toEqual(22000);
    expect(currentOffset()).toEqual(22000);
  });

  it('shows a paused state when the browser blocks play()', async () => {
    const video = fakeVideo();
    video.play = vi.fn(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')));
    setVideo(video);
    store.dispatch(pause());
    store.dispatch(play());
    expect(store.getState().desiredPlaySpeed).toEqual(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().desiredPlaySpeed).toEqual(0);
  });
});
