import { vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';

import { createInitialState } from '../initialState';
import { createAppStore } from '../store';
import { navigate, popTimelineRange, primeNav, pushTimelineRange, selectDevice, streamNav } from './index';

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: () => true },
    routes: { getRoutesSegments: vi.fn(async () => []) },
  },
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

function open(url) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const store = createAppStore(history, createInitialState());
  const announce = (location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } });
  history.listen(announce);
  announce(history.location, history.action);
  return { history, store };
}

describe('navigation actions', () => {
  it.each([
    ['selectDevice', () => selectDevice(OTHER), `/${OTHER}`],
    ['primeNav', () => primeNav(true), `/${DONGLE}/prime`],
    ['streamNav', () => streamNav(true), `/${DONGLE}/stream`],
    ['the referrals page', () => navigate({ page: 'referrals' }), '/referrals'],
    ['a zoom from 0 seconds', () => pushTimelineRange(LOG, 0, 20000), `/${DONGLE}/${LOG}/0/20`],
    ['a zoom shorter than a second', () => pushTimelineRange(LOG, 10200, 10800), `/${DONGLE}/${LOG}/10/11`],
    ['closing a drive', () => pushTimelineRange(null, null, null), `/${DONGLE}`],
  ])('%s writes its URL', (_name, action, url) => {
    const { history, store } = open(`/${DONGLE}/${LOG}`);
    store.dispatch(action());
    expect(`${history.location.pathname}${history.location.search}`).toBe(url);
  });

  it('keeps a zoom shorter than a second precise in state', () => {
    const { store } = open(`/${DONGLE}/${LOG}`);
    store.dispatch(pushTimelineRange(LOG, 10200, 10800));
    expect(store.getState().zoom).toMatchObject({ start: 10200, end: 10800 });
  });

  it('zooms back out to the previous range', () => {
    const { history, store } = open(`/${DONGLE}/${LOG}/10/20`);
    store.dispatch(pushTimelineRange(LOG, 12000, 14000));
    store.dispatch(popTimelineRange(LOG));
    expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}/10/20`);
    expect(store.getState().zoom).toMatchObject({ start: 10000, end: 20000 });
  });
});
