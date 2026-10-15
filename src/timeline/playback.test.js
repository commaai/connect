import { reducer, selectLoop } from './playback';

describe('playback reducer', () => {
  it('sets the loop from a selected range', () => {
    const state = reducer({ loop: null }, selectLoop(1000, 3000));
    expect(state.loop).toEqual({ startTime: 1000, duration: 2000 });
  });

  it('clears the loop when the range is incomplete', () => {
    const state = reducer({ loop: { startTime: 1000, duration: 2000 } }, selectLoop(null, null));
    expect(state.loop).toBeNull();
  });

  it('leaves state untouched for other actions', () => {
    const state = { loop: null };
    expect(reducer(state, { type: 'OTHER' })).toBe(state);
  });
});
