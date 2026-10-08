import { currentOffset, seek } from '.';
import { bufferVideo, pause, play, reducer, resetPlayback, selectLoop, setPlaying } from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1, // 0 = paused, otherwise playback speed
    isBufferingVideo: false,
    isPlaying: false,
    loop: null,
  };
};

describe('playback', () => {
  it('has playback controls', () => {
    let state = makeDefaultStruct();

    // pausing and resuming
    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);
    state = reducer(state, play());
    expect(state.desiredPlaySpeed).toEqual(1);
    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    state = reducer(state, play(2));
    expect(state.desiredPlaySpeed).toEqual(2);

    // no-op updates keep the same state object (play always changes so the
    // video player re-asserts its intent, e.g. after blocked autoplay)
    const samePause = reducer(state, pause());
    expect(samePause).not.toBe(state);
    const sameState = reducer(state, pause());
    expect(sameState.desiredPlaySpeed).toEqual(0);
    expect(reducer(sameState, pause())).toBe(sameState);
  });

  it('sets and clears loops', () => {
    let state = makeDefaultStruct();

    state = reducer(state, selectLoop(1000, 2000));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.loop.duration).toEqual(1000);

    state = reducer(state, selectLoop(1000, 2000));
    expect(state.loop.startTime).toEqual(1000);

    state = reducer(state, selectLoop(null, null));
    expect(state.loop).toBeNull();
  });

  it('tracks buffering and playing state separately from intent', () => {
    let state = makeDefaultStruct();

    state = reducer(state, bufferVideo(true));
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.isBufferingVideo).toEqual(true);

    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.isBufferingVideo).toEqual(true);

    state = reducer(state, bufferVideo(false));
    expect(state.isBufferingVideo).toEqual(false);

    state = reducer(state, setPlaying(true));
    expect(state.isPlaying).toEqual(true);
    state = reducer(state, setPlaying(false));
    expect(state.isPlaying).toEqual(false);
  });

  it('resets playback', () => {
    let state = makeDefaultStruct();
    state = reducer(state, pause());
    state = reducer(state, bufferVideo(false));
    state = reducer(state, setPlaying(true));
    state = reducer(state, selectLoop(1000, 2000));

    state = reducer(state, resetPlayback());
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.isBufferingVideo).toEqual(true);
    expect(state.isPlaying).toEqual(false);
    // the selection loop is kept, only playback restarts
    expect(state.loop.startTime).toEqual(1000);
  });

  it('seeks the playback clock', () => {
    seek(123);
    expect(currentOffset()).toEqual(123);

    seek(-500);
    expect(currentOffset()).toEqual(0);

    seek(9000);
    expect(currentOffset()).toEqual(9000);
  });
});
