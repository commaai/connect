import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
import { primeNav, pushTimelineRange, streamNav } from './index';

const DEVICE = 'aaaaaaaaaaaaaaaa';
const LOG = '2026-08-06--12-00-00';
function setup(path = `/${DEVICE}`) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const store = createAppStore(history, createInitialState(history.location));
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  return { history, store };
}
beforeEach(() => {
  vi.spyOn(api.routes, 'getRoutesSegments').mockResolvedValue([]);
  vi.spyOn(api.auth, 'isAuthenticated').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

test.each([
  [null, null, `/${DEVICE}/${LOG}`],
  [0, 20000, `/${DEVICE}/${LOG}/0/20`],
  [10100, 10900, `/${DEVICE}/${LOG}/10/11`],
])('drive action navigates then applies canonical range %s-%s', (start, end, expected) => {
  const { history, store } = setup();
  store.dispatch(pushTimelineRange(LOG, start, end));
  expect(history.location.pathname).toBe(expected);
  expect(store.getState().selectedRouteId).toBe(LOG);
  expect(store.getState().zoom).toEqual(start == null ? null
    : { start, end });
});

test.each([['prime', primeNav, 'primeNav'], ['stream', streamNav, 'streamNav']])(
  '%s action round trips through history without losing unrelated query/hash', (page, action, field) => {
    const { history, store } = setup(`/${DEVICE}?keep=1#map`);
    store.dispatch(action(true));
    expect(history.location.pathname).toBe(`/${DEVICE}/${page}`);
    expect(store.getState()[field]).toBe(true);
    expect(history.location.search).toBe('?keep=1');
    expect(history.location.hash).toBe('#map');
    store.dispatch(action(false));
    expect(history.location.pathname).toBe(`/${DEVICE}`);
    expect(store.getState()[field]).toBe(false);
    history.goBack();
    expect(store.getState()[field]).toBe(true);
  },
);
