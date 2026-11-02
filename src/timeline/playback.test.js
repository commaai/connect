import { reducer, selectLoop } from './playback';

describe('playback', () => {
  it('selects and clears a loop', () => {
    let state = reducer({}, selectLoop(1000, 3000));
    expect(state.loop).toEqual({ startTime: 1000, duration: 2000 });

    state = reducer(state, selectLoop(null, null));
    expect(state.loop).toBeNull();
  });

  it('starts a whole-route loop at the first video frame', () => {
    const state = reducer({
      currentRoute: { videoStartOffset: 2000 },
      zoom: { start: 0, end: 60000 },
    }, selectLoop(0, 60000));
    expect(state.loop).toEqual({ startTime: 2000, duration: 58000 });
  });

  it('keeps a zoomed loop as selected', () => {
    const state = reducer({
      currentRoute: { videoStartOffset: 2000 },
      zoom: { start: 10000, end: 20000 },
    }, selectLoop(10000, 20000));
    expect(state.loop).toEqual({ startTime: 10000, duration: 10000 });
  });
});
