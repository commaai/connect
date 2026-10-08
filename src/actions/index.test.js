import { vi } from 'vitest';
import { replace } from 'connected-react-router';
import { popTimelineRange, pushTimelineRange } from './index';
import reducer from '../reducers/globalState';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(() => ({ type: 'resetPlayback' })),
  selectLoop: vi.fn(() => ({ type: 'selectLoop' })),
}));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

function createStore(state, pathname = `/${DONGLE}/${LOG}`) {
  const store = {
    state: { dongleId: DONGLE, selectedRouteId: LOG, currentRoute: { log_id: LOG, duration: 60000 }, routes: null, loop: null, files: null, ...state, router: { location: { pathname, search: '' } } },
    history: [],
  };
  store.dispatch = (action) => {
    if (typeof action === 'function') return action(store.dispatch, () => store.state);
    if (action.type === '@@router/CALL_HISTORY_METHOD') store.history.push(action);
    else store.state = reducer(store.state, action);
    return action;
  };
  return store;
}

describe('timeline actions', () => {
  it('stacks a pushed range without writing the URL', () => {
    const whole = { start: 0, end: 60000, previous: null };
    const store = createStore({ zoom: whole });
    store.dispatch(pushTimelineRange(LOG, 10000, 20000));
    expect(store.state.zoom).toEqual({ start: 10000, end: 20000, previous: whole });
    expect(store.history).toEqual([]);
  });

  it('sets a range without stacking when told not to', () => {
    const store = createStore({ zoom: { start: 0, end: 60000, previous: null } });
    store.dispatch(pushTimelineRange(LOG, 10000, 20000, false));
    expect(store.state.zoom).toEqual({ start: 10000, end: 20000, previous: null });
  });

  it('keeps cached files when zooming into a range that starts at 0', () => {
    const files = { [`${DONGLE}|${LOG}/0/fcamera.hevc`]: { url: 'x' } };
    const store = createStore({ zoom: { start: 0, end: 60000, previous: null }, files });
    store.dispatch(pushTimelineRange(LOG, 0, 20000));
    expect(store.state.files).toBe(files);
  });

  it.each([
    ['the whole drive', { start: 0, end: 60000, previous: null }, `/${DONGLE}/${LOG}`],
    ['a range', { start: 10000, end: 20000, previous: null }, `/${DONGLE}/${LOG}/10/20`],
    ['a range that starts at 0', { start: 0, end: 20000, previous: null }, `/${DONGLE}/${LOG}/0/20`],
  ])('pops back to %s and replaces the URL', (_name, previous, expected) => {
    const store = createStore({ zoom: { start: 12000, end: 15000, previous } }, `/${DONGLE}/${LOG}/12/15`);
    store.dispatch(popTimelineRange());
    expect(store.state.zoom).toEqual(previous);
    expect(store.history).toEqual([replace(expected)]);
  });

  it('does not pop without a previous range', () => {
    const zoom = { start: 10000, end: 20000, previous: null };
    const store = createStore({ zoom }, `/${DONGLE}/${LOG}/10/20`);
    store.dispatch(popTimelineRange());
    expect(store.state.zoom).toBe(zoom);
    expect(store.history).toEqual([]);
  });
});
