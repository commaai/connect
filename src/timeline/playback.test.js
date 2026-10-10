import { bufferVideo, normalizeLoopOffset, pause, play, reducer, seek, selectLoop, videoProgress } from './playback';
import { currentOffset } from '.';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed
    offset: 0,           // in miliseconds from the start; a copy of the video's position
    isBuffering: true,
  };
};

describe('playback', () => {
  it('keeps play/pause/speed as pure state changes', () => {
    let state = makeDefaultStruct();

    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);
    // the <video> element is the clock, so pausing must not move the offset
    expect(state.offset).toEqual(0);

    state = reducer(state, play());
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.offset).toEqual(0);

    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.offset).toEqual(0);
  });

  it('seeks immediately and clamps to the loop', () => {
    let state = makeDefaultStruct();

    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);
    expect(currentOffset(state)).toEqual(123);

    state = reducer(state, selectLoop(1000, 2000));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.loop.duration).toEqual(1000);
  });

  it('should clamp loop when seeked after loop end time', () => {
    let state = makeDefaultStruct();

    // set up loop
    state = reducer(state, play());
    state = reducer(state, selectLoop(
      1000,
      2000,
    ));
    expect(state.loop.startTime).toEqual(1000);

    // seek past loop end boundary
    state = reducer(state, seek(3000));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(2000);
  });

  it('should clamp loop when seeked before loop start time', () => {
    let state = makeDefaultStruct();

    // set up loop
    state = reducer(state, play());
    state = reducer(state, selectLoop(
      1000,
      2000,
    ));
    expect(state.loop.startTime).toEqual(1000);

    // seek before loop start boundary
    state = reducer(state, seek(0));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(1000);
  });

  it('publishes the video element position verbatim', () => {
    let state = makeDefaultStruct();

    state = reducer(state, play(2));
    state = reducer(state, videoProgress(5000));
    expect(state.offset).toEqual(5000);
    // the speed must not change the reported position
    expect(currentOffset(state)).toEqual(5000);

    state = reducer(state, pause());
    expect(state.offset).toEqual(5000);
  });

  it('wraps the published position around the loop', () => {
    let state = makeDefaultStruct();

    state = reducer(state, selectLoop(1000, 2000));

    // past the loop end: the video wraps back to the start of the loop
    state = reducer(state, videoProgress(3500));
    expect(state.offset).toEqual(1500);

    // inside the loop: untouched
    state = reducer(state, videoProgress(1800));
    expect(state.offset).toEqual(1800);

    // before the loop start: clamped up to the loop start
    state = reducer(state, videoProgress(10));
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
    // buffering no longer distorts the clock
    expect(state.offset).toEqual(0);

    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.isBufferingVideo).toEqual(true);

    state = reducer(state, play(2));
    state = reducer(state, bufferVideo(false));
    expect(state.desiredPlaySpeed).toEqual(2);
    expect(state.isBufferingVideo).toEqual(false);

    expect(state.desiredPlaySpeed).toEqual(2);
  });

  it('does not extrapolate offsets over time', () => {
    let state = makeDefaultStruct();

    state = reducer(state, videoProgress(1000));

    // no amount of wall-clock time may change a published offset
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(currentOffset(state)).toEqual(1000);
        resolve();
      }, 60);
    });
  });
});

describe('normalizeLoopOffset', () => {
  it('leaves a null loop alone', () => {
    expect(normalizeLoopOffset(500, null)).toEqual(500);
    expect(normalizeLoopOffset(null, null)).toEqual(null);
  });

  it('clamps below the loop and wraps above it', () => {
    const loop = { startTime: 1000, duration: 1000 };
    expect(normalizeLoopOffset(500, loop)).toEqual(1000);
    expect(normalizeLoopOffset(1500, loop)).toEqual(1500);
    expect(normalizeLoopOffset(2000, loop)).toEqual(1000);
    expect(normalizeLoopOffset(3500, loop)).toEqual(1500);
  });
});
