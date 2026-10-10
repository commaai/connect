import { attachVideo, currentOffset, videoOffset } from '.';
import { pause, play, reducer, resetPlayback, seek, selectLoop } from './playback';

const route = { fullname: 'a|b', videoStartOffset: 2000 };

function dispatchSeek(state, offset) {
  let action;
  seek(offset)((a) => { action = a; }, () => state);
  return reducer(state, action);
}

describe('playback', () => {
  afterEach(() => attachVideo(null));

  it('only stores what the user asked for', () => {
    let state = { desiredPlaySpeed: 1, offset: null, loop: null };

    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);

    state = reducer(state, selectLoop(1000, 3000));
    expect(state.loop).toEqual({ startTime: 1000, duration: 2000 });

    state = reducer(state, selectLoop(null, null));
    expect(state.loop).toEqual(null);

    state = reducer(state, resetPlayback());
    expect(state).toMatchObject({ desiredPlaySpeed: 1, offset: 0 });
  });

  it('falls back to the last seek before a video loads', () => {
    let state = { desiredPlaySpeed: 1, offset: null, loop: { startTime: 1000, duration: 1000 } };
    expect(videoOffset(state)).toEqual(null);
    expect(currentOffset(state)).toEqual(1000);

    state = dispatchSeek(state, 1500);
    expect(state.offset).toEqual(1500);
    expect(currentOffset(state)).toEqual(1500);
  });

  it('clamps seeks to the loop', () => {
    let state = { desiredPlaySpeed: 1, offset: 0, loop: { startTime: 1000, duration: 1000 } };

    state = dispatchSeek(state, 3000);
    expect(state.offset).toEqual(2000);

    state = dispatchSeek(state, 0);
    expect(state.offset).toEqual(1000);
  });

  it('reads and moves the video once it is attached', () => {
    const video = { currentTime: 10 };
    attachVideo(video);
    let state = { desiredPlaySpeed: 1, offset: 0, loop: null, currentRoute: route };

    // the video starts videoStartOffset into the route
    expect(currentOffset(state)).toEqual(12000);

    state = dispatchSeek(state, 32000);
    expect(video.currentTime).toEqual(30);
    expect(currentOffset(state)).toEqual(32000);

    // the route before the video starts maps to the start of the video
    state = dispatchSeek(state, 500);
    expect(video.currentTime).toEqual(0);
    expect(currentOffset(state)).toEqual(2000);
  });

  it('keeps the video position inside the loop', () => {
    const video = { currentTime: 30 };
    attachVideo(video);
    const state = { desiredPlaySpeed: 1, offset: 0, loop: { startTime: 5000, duration: 10000 }, currentRoute: route };

    expect(videoOffset(state)).toEqual(32000);
    expect(currentOffset(state)).toEqual(15000);
  });
});
