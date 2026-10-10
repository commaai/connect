import { currentOffset } from '.';
import { pause, play, reducer, seek, selectLoop } from './playback';
import { attachVideo, detachVideo, getVideo } from './video';

// desiredPlaySpeed: 0 = stopped, 1 = playing, 2 = 2x speed; offset: last seek target in ms from the start
const makeDefaultStruct = () => ({ desiredPlaySpeed: 1, offset: null, seekId: 0, loop: null, currentRoute: null });
const fakeVideo = (props = {}) => ({ currentTime: 0, readyState: 4, ...props });

afterEach(() => detachVideo(getVideo()));

describe('playback', () => {
  it('seek sets the offset and bumps seekId', () => {
    let state = reducer(makeDefaultStruct(), seek(123));
    expect(state.offset).toEqual(123);
    expect(state.seekId).toEqual(1);
    state = reducer(state, seek(456));
    expect(state.offset).toEqual(456);
    expect(state.seekId).toEqual(2);
  });

  it('pause and play only change the speed, never the offset', () => {
    let state = reducer(makeDefaultStruct(), seek(5000));
    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);
    state = reducer(state, play());
    expect(state.desiredPlaySpeed).toEqual(1);
    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.offset).toEqual(5000);
    expect(state.seekId).toEqual(1);
  });

  it('selectLoop sets and clears the loop', () => {
    let state = reducer(makeDefaultStruct(), selectLoop(1000, 2000));
    expect(state.loop).toEqual({ startTime: 1000, duration: 1000 });
    state = reducer(state, selectLoop(null, null));
    expect(state.loop).toBeNull();
  });

  it('should clamp loop when seeked outside the loop', () => {
    let state = reducer(makeDefaultStruct(), selectLoop(1000, 2000));
    state = reducer(state, seek(3000));
    expect(state.offset).toEqual(2000);
    state = reducer(state, seek(0));
    expect(state.offset).toEqual(1000);
    expect(state.loop.startTime).toEqual(1000);
  });

  it('does not touch unrelated actions', () => {
    const state = makeDefaultStruct();
    expect(reducer(state, { type: 'SOMETHING_ELSE' })).toEqual(state);
  });
});

describe('currentOffset', () => {
  it('falls back to the seek target, then the loop start, then 0 without a video clock', () => {
    let state = makeDefaultStruct();
    expect(currentOffset(state)).toEqual(0);
    state = reducer(state, selectLoop(1000, 2000));
    expect(currentOffset(state)).toEqual(1000);
    state = reducer(state, seek(1500));
    expect(currentOffset(state)).toEqual(1500);
    attachVideo(fakeVideo({ currentTime: 50, readyState: 0 }));
    expect(currentOffset(state)).toEqual(1500);
  });

  it('reads the video clock, including the route video start offset, regardless of pause', () => {
    const video = fakeVideo({ currentTime: 12.5 });
    attachVideo(video);
    let state = reducer(makeDefaultStruct(), seek(0));
    expect(currentOffset(state)).toEqual(12500);
    state.currentRoute = { videoStartOffset: 300 };
    expect(currentOffset(state)).toEqual(12800);
    state = reducer(state, pause());
    video.currentTime = 13;
    expect(currentOffset(state)).toEqual(13300);
  });

  it('clamps the video clock into the loop', () => {
    const video = fakeVideo({ currentTime: 0.5 });
    attachVideo(video);
    const state = reducer(makeDefaultStruct(), selectLoop(1000, 2000));
    expect(currentOffset(state)).toEqual(1000);
    video.currentTime = 1.5;
    expect(currentOffset(state)).toEqual(1500);
    video.currentTime = 2.5;
    expect(currentOffset(state)).toEqual(2000);
  });
});
