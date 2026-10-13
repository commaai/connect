import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import * as Types from '../actions/types';
import { bindMediaElement, resetMediaSessionForTests } from './media';
import { mirrorPlayback, pause, play, reducer, seek, selectLoop } from './playback';

const initial = () => ({ playRequested: true, isPaused: true, playSpeed: 1, offset: 0,
  seekGeneration: 0, zoom: { start: 0, end: 60000 },
  currentRoute: { fullname: 'dongle|log', videoStartOffset: 0, duration: 60000 } });
const makeStore = () => createStore(reducer, initial(), applyMiddleware(thunk));

describe('playback commands and observations', () => {
  beforeEach(resetMediaSessionForTests);

  it('keeps the reducer deterministic without reading media', () => {
    const state = initial();
    bindMediaElement({ currentTime: 12, readyState: 2 }, { routeFullname: 'dongle|log' });
    expect(reducer(state, { type: Types.ACTION_PAUSE, offset: 100 })).toEqual(
      { ...state, offset: 100, playRequested: false },
    );
    expect(reducer(state, { type: Types.ACTION_SEEK, offset: NaN })).toBe(state);
  });

  it('executes every play gesture even when the requested rate is unchanged', () => {
    const store = makeStore();
    const controller = { play: vi.fn(), pause: vi.fn(), readOffset: () => 12345 };
    bindMediaElement({}, { routeFullname: 'dongle|log', controller });
    store.dispatch(play());
    store.dispatch(play());
    expect(controller.play).toHaveBeenCalledTimes(2);
    store.dispatch(play(0.5));
    store.dispatch(pause());
    expect(controller.pause).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({ offset: 12345, playRequested: false, playSpeed: 0.5 });
    store.dispatch(play());
    expect(controller.play).toHaveBeenLastCalledWith(0.5);
  });

  it('clamps seeks to the selection while retaining a zero-start loop', () => {
    const store = makeStore();
    store.dispatch(selectLoop(0, 2000));
    store.dispatch(seek(3000));
    expect(store.getState()).toMatchObject({ offset: 2000, seekGeneration: 1,
      loop: { startTime: 0, duration: 2000 } });
    store.dispatch(selectLoop(1000, 2000));
    store.dispatch(seek(0));
    expect(store.getState().offset).toBe(1000);
    store.dispatch(seek(Infinity));
    expect(store.getState().seekGeneration).toBe(2);
  });

  it('only accepts observations from the selected route and rejects invalid rates', () => {
    const store = makeStore();
    const state = store.getState();
    store.dispatch(mirrorPlayback('other|route', { isPaused: false }));
    expect(store.getState()).toBe(state);
    store.dispatch(mirrorPlayback('dongle|log', { isPaused: false }));
    expect(store.getState().isPaused).toBe(false);
    for (const rate of [0, -1, NaN, Infinity, 9]) store.dispatch(play(rate));
    expect(store.getState().playSpeed).toBe(1);
  });
});
