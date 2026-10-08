import { pause, play, reducer, resetPlayback, selectLoop } from './playback';

describe('playback', () => {
  it('tracks the play speed the user asked for', () => {
    let state = { desiredPlaySpeed: 1 };

    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);

    state = reducer(state, resetPlayback());
    expect(state.desiredPlaySpeed).toEqual(1);
  });

  it('selects and clears a loop', () => {
    let state = reducer({}, selectLoop(1000, 3000));
    expect(state.loop).toEqual({ startTime: 1000, duration: 2000 });

    state = reducer(state, selectLoop(null, null));
    expect(state.loop).toBeNull();
  });

  it('leaves unrelated actions alone', () => {
    const state = { desiredPlaySpeed: 1 };
    expect(reducer(state, { type: 'OTHER' })).toBe(state);
  });
});
