import { RouteVideo } from '../components/DriveVideo';
import { asyncSleep } from '../utils';
import { currentOffset } from '.';
import { bufferVideo, pause, play, reducer, seek, selectLoop, videoTime } from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed
    offset: 0, // in miliseconds from the start
    startTime: Date.now(), // millisecond timestamp in which play began

    isBuffering: true,
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

  it('should buffer video and data', async () => {
    newNow();
    let state = makeDefaultStruct();

    state = reducer(state, play());
    expect(state.desiredPlaySpeed).toEqual(1);

    // claim the video is buffering
    state = reducer(state, bufferVideo(true));
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.isBufferingVideo).toEqual(true);

    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.isBufferingVideo).toEqual(true);

    expect(state.desiredPlaySpeed).toEqual(0.5);

    state = reducer(state, play(2));
    state = reducer(state, bufferVideo(false));
    expect(state.desiredPlaySpeed).toEqual(2);
    expect(state.isBufferingVideo).toEqual(false);

    expect(state.desiredPlaySpeed).toEqual(2);
  });
});


describe('media clock', () => {
  it('does not advance during buffering, pause or rate changes', () => {
    let state = reducer(makeDefaultStruct(), videoTime(1234));
    mostRecentNow += 10000;
    for (const action of [bufferVideo(true), play(2), pause()]) {
      state = reducer(state, action);
      expect(currentOffset(state)).toBe(1234);
    }
    state = reducer(state, seek(2000));
    expect(currentOffset(state)).toBe(2000);
    expect(state.seekRevision).toBe(1);
    state = reducer(state, videoTime(null));
    expect(state.offset).toBe(2000);
  });

  it('keeps the map-only clock and zero-start loops working', () => {
    let state = reducer(makeDefaultStruct(), selectLoop(0, 1000));
    mostRecentNow += 1500;
    expect(currentOffset(state)).toBe(500);
    state = reducer(state, videoTime(900));
    mostRecentNow += 10000;
    expect(currentOffset(state)).toBe(900);
  });
});

describe('route video', () => {
  const makeVideo = (extra = {}) => {
    const props = { currentRoute: { fullname: 'test', videoStartOffset: 500 }, desiredPlaySpeed: 1,
      dispatch: vi.fn(), ...extra };
    const video = new RouteVideo(props);
    video.setState = (update) => { video.state = { ...video.state,
      ...(typeof update === 'function' ? update(video.state) : update) }; };
    const media = { seeking: false, paused: false, readyState: 4, play: vi.fn() };
    video.videoPlayer.current = { getCurrentTime: () => 2, getInternalPlayer: () => media, seekTo: vi.fn() };
    video.ready = true;
    video.state.status = 'ready';
    return video;
  };

  it('reports media progress without seeking, and seeks only at loop boundaries', () => {
    const video = makeVideo();
    video.onProgress();
    expect(video.props.dispatch).toHaveBeenCalledWith(videoTime(2500));
    expect(video.videoPlayer.current.seekTo).not.toHaveBeenCalled();
    video.props.loop = { startTime: 0, duration: 2000 };
    video.onProgress();
    expect(video.videoPlayer.current.seekTo).toHaveBeenCalledWith(0, 'seconds');
    expect(video.pendingSeek).toBe(true);
    video.props.dispatch.mockClear();
    video.onProgress();
    expect(video.props.dispatch).not.toHaveBeenCalled();
  });

  it('releases buffering when switching to the map while loading', () => {
    let state = makeDefaultStruct();
    const video = makeVideo({ dispatch: (action) => { state = reducer(state, action); } });
    video.componentDidMount();
    expect(state.isBufferingVideo).toBe(true);
    video.componentWillUnmount();
    const offset = currentOffset(state);
    mostRecentNow += 5000;
    expect(currentOffset(state)).toBe(offset + 5000);
    expect(state.videoTime).toBe(null);
  });

  it('does not publish stale progress while a user seek is pending', () => {
    const video = makeVideo();
    video.seekToTimeline(5000);
    expect(video.pendingSeek).toBe(true);
    video.onProgress();
    expect(video.props.dispatch).not.toHaveBeenCalled();
    video.videoPlayer.current.getCurrentTime = () => 4.5;
    video.onSeek();
    expect(video.props.dispatch).toHaveBeenCalledWith(videoTime(5000));
  });

  it('freezes loading/failure before progress and records native pause/end', () => {
    const video = makeVideo({ desiredPlaySpeed: 1 });
    video.ready = false;
    video.state.status = 'loading';
    video.componentDidMount();
    expect(video.props.dispatch.mock.calls[0][0].type).toBe(videoTime(0).type);
    expect(video.props.dispatch).toHaveBeenCalledWith(bufferVideo(true));
    video.onError(new Error('network failure'));
    expect(video.state.status).toBe('failed');
    video.state.status = 'ready';
    video.onPause();
    expect(video.props.dispatch).toHaveBeenCalledWith(pause());
    video.props.dispatch.mockClear();
    video.onEnded();
    expect(video.props.dispatch.mock.calls.map(([action]) => action)).toEqual([videoTime(2500), pause()]);
  });

  it('ignores recoverable HLS errors, exposes autoplay Play, and remounts on Retry', () => {
    const video = makeVideo();
    video.onError('hlsError', { fatal: false });
    expect(video.state.status).toBe('ready');
    video.onError({ name: 'NotAllowedError' });
    expect(video.props.dispatch).toHaveBeenCalledWith(pause());
    expect(video.state.error).toBe(null);
    video.onError('hlsError', { fatal: true, response: { code: 404 } });
    expect(video.state.status).toBe('failed');
    video.onPlayable();
    expect(video.state.status).toBe('failed');
    video.retry();
    expect(video.state.status).toBe('loading');
    expect(video.state.attempt).toBe(1);
    expect(video.ready).toBe(false);
  });
});
