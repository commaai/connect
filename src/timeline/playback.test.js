import { asyncSleep } from '../utils';
import { currentOffset, resetVideo, setVideo, setVideoStartOffset } from '.';
import { bufferVideo, pause, play, reducer, seek, selectLoop, videoTime } from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed
    offset: 0, // in miliseconds from the start

    isBufferingVideo: true,
  };
};

/** Minimal stand-in for the parts of HTMLMediaElement the bridge reads. */
function fakeVideo(currentTime = 0) {
  return { currentTime };
}

describe('playback', () => {
  afterEach(() => {
    resetVideo();
  });

  it('has playback controls', async () => {
    let state = makeDefaultStruct();

    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    state = reducer(state, play());
    expect(state.desiredPlaySpeed).toEqual(1);

    // The video reports where it actually is. Elapsed wall time is irrelevant.
    await asyncSleep(100 + Math.random() * 200);
    state = reducer(state, videoTime(1000));
    expect(state.offset).toEqual(1000);

    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);

    await asyncSleep(100 + Math.random() * 200);
    expect(state.offset).toEqual(1000); // unchanged: only the video moves it

    state = reducer(state, pause());
    expect(state.offset).toEqual(1000);

    // seek!
    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);
    expect(currentOffset(state)).toEqual(123);
  });

  it('does not advance position just because time passed', async () => {
    let state = makeDefaultStruct();
    state = reducer(state, videoTime(2000));

    await asyncSleep(300);
    const after = reducer(state, { type: 'UNRELATED' });

    // The old architecture extrapolated from Date.now() and drifted. Position
    // must not move until the video says so.
    expect(after.offset).toEqual(2000);
    expect(currentOffset(after)).toEqual(2000);
  });

  it('reads position from the video element when one is attached', () => {
    const state = reducer(makeDefaultStruct(), videoTime(0));

    setVideoStartOffset(5000); // logs start before the camera's first frame
    setVideo(fakeVideo(12.5));
    expect(currentOffset(state)).toEqual(17500);

    fakeVideo(20);
    setVideo(fakeVideo(20));
    expect(currentOffset(state)).toEqual(25000);
  });

  it('does not report a negative offset before the first frame', () => {
    setVideoStartOffset(5000);
    setVideo(fakeVideo(1));
    expect(currentOffset(makeDefaultStruct())).toEqual(5000);
  });

  it('falls back to the recorded offset when no video is attached', () => {
    const state = reducer(makeDefaultStruct(), videoTime(7000));
    expect(currentOffset(state)).toEqual(7000);
  });

  it('should clamp loop when seeked after loop end time', () => {
    let state = makeDefaultStruct();

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

    state = reducer(state, play());
    state = reducer(state, selectLoop(
      1000,
      2000,
    ));
    expect(state.loop.startTime).toEqual(1000);

    // seek before loop start
    state = reducer(state, seek(0));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(1000);
  });

  it('should buffer video and data', () => {
    let state = makeDefaultStruct();

    state = reducer(state, play());
    expect(state.desiredPlaySpeed).toEqual(1);

    // claim the video is buffering
    state = reducer(state, bufferVideo(true));
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.isBufferingVideo).toEqual(true);

    // buffering is UI-only: it must not freeze or change the chosen speed
    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.isBufferingVideo).toEqual(true);

    state = reducer(state, play(2));
    state = reducer(state, bufferVideo(false));
    expect(state.desiredPlaySpeed).toEqual(2);
    expect(state.isBufferingVideo).toEqual(false);
  });

  it('keeps the recorded position inside the loop while detached', () => {
    let state = makeDefaultStruct();
    state = reducer(state, selectLoop(1000, 2000));
    state = reducer(state, videoTime(5000));
    expect(state.offset).toEqual(1500); // wrapped
  });

  it('leaves position alone while a video is attached', () => {
    setVideo(fakeVideo(1.5));
    let state = makeDefaultStruct();
    state = reducer(state, selectLoop(1000, 2000));
    state = reducer(state, videoTime(5000));

    // The element owns position now; the reducer must not wrap it behind the
    // player's back. The player wraps from real media time instead.
    expect(state.offset).toEqual(5000);
  });
});