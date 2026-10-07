import { currentOffset } from '.';
import { setVideoElement } from './video';
import { bufferVideo, pause, play, reducer, seek, selectLoop } from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed
    offset: 0, // requested playhead, in miliseconds from the start
    startTime: 0, // changes on every seek request

    isBuffering: true,
  };
};

describe('playback', () => {
  it('has playback controls', () => {
    let state = makeDefaultStruct();

    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);

    // play and pause don't move the playhead, the video does
    expect(state.offset).toEqual(0);
    expect(state.startTime).toEqual(0);
  });

  it('marks every seek as a new request', () => {
    let state = makeDefaultStruct();

    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);
    const firstRequest = state.startTime;

    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);
    expect(state.startTime).toBeGreaterThanOrEqual(firstRequest);
    expect(state.startTime).not.toEqual(0);
  });

  it('should clamp loop when seeked after loop end time', () => {
    let state = makeDefaultStruct();

    state = reducer(state, play());
    state = reducer(state, selectLoop(1000, 2000));
    expect(state.loop.startTime).toEqual(1000);

    state = reducer(state, seek(3000));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(2000);
  });

  it('should clamp loop when seeked before loop start time', () => {
    let state = makeDefaultStruct();

    state = reducer(state, play());
    state = reducer(state, selectLoop(1000, 2000));
    expect(state.loop.startTime).toEqual(1000);

    state = reducer(state, seek(0));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(1000);
  });

  it('moves the playhead into a new loop', () => {
    let state = makeDefaultStruct();

    state = reducer(state, selectLoop(5000, 8000));
    expect(state.offset).toEqual(5000);

    // already inside the loop: stays put
    state = reducer(state, seek(6000));
    state = reducer(state, selectLoop(5000, 7000));
    expect(state.offset).toEqual(6000);
  });

  it('treats a range without bounds as no loop', () => {
    let state = makeDefaultStruct();

    state = reducer(state, selectLoop(NaN, NaN));
    expect(state.loop).toBeNull();
  });

  it('should buffer video and data', () => {
    let state = makeDefaultStruct();

    state = reducer(state, play());
    state = reducer(state, bufferVideo(true));
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.isBufferingVideo).toEqual(true);

    state = reducer(state, play(2));
    state = reducer(state, bufferVideo(false));
    expect(state.desiredPlaySpeed).toEqual(2);
    expect(state.isBufferingVideo).toEqual(false);
  });
});

describe('currentOffset', () => {
  afterEach(() => setVideoElement(null));

  it('reads the playhead from the video', () => {
    const state = { offset: 0, currentRoute: { videoStartOffset: 850 } };
    setVideoElement({ currentTime: 12.5, readyState: 4 });
    expect(currentOffset(state)).toEqual(13350);
  });

  it('falls back to the requested position without a video', () => {
    expect(currentOffset({ offset: 4000, currentRoute: {} })).toEqual(4000);
    expect(currentOffset({ offset: null, loop: { startTime: 1000 } })).toEqual(1000);
  });

  it('falls back to the requested position while the video has nothing loaded', () => {
    setVideoElement({ currentTime: 0, readyState: 0 });
    expect(currentOffset({ offset: 4000, currentRoute: {} })).toEqual(4000);
  });
});
