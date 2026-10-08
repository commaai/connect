import { vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';

import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import { createAppStore } from '../store';

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: () => true },
    devices: { fetchDevice: () => new Promise(() => {}) },
    routes: { getRoutesSegments: vi.fn() },
  },
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const DRIVE_START = 1_786_017_600_000;

function create(pathname) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState(pathname));
  // what ConnectedRouter does when it mounts and on every history change
  const locationChanged = (location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } });
  history.listen(locationChanged);
  locationChanged(history.location, history.action);
  const select = () => {
    const { dongleId, selectedRouteId, zoom } = store.getState();
    return { dongleId, selectedRouteId, zoom: zoom && { start: zoom.start, end: zoom.end } };
  };
  return { history, store, select };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.routes.getRoutesSegments.mockReturnValue(new Promise(() => {}));
});

describe('url -> state', () => {
  const dashboard = { dongleId: DONGLE, selectedRouteId: null, zoom: null };

  it.each([
    [`/${DONGLE}`, dashboard],
    [`/${DONGLE}/prime`, dashboard],
    [`/${DONGLE}/${LOG}/10/20`, { ...dashboard, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } }],
    [`/${OTHER}`, { ...dashboard, dongleId: OTHER }],
    ['/referrals', dashboard],
  ])('pushing %s sets state from the URL', (pathname, expected) => {
    const { history, select } = create(`/${DONGLE}/${LOG}`);
    history.push(pathname);
    expect(select()).toEqual(expected);
  });

  it('ignores an absent action', () => {
    const { store } = create(`/${DONGLE}`);
    expect(() => store.dispatch(undefined)).not.toThrow();
  });

  it('applying the URL the state already shows changes nothing', () => {
    const { history, store } = create(`/${DONGLE}/${LOG}/10/20`);
    const before = store.getState();
    history.replace(`/${DONGLE}/${LOG}/10/20`);
    const after = store.getState();
    expect(Object.keys(after).filter((key) => key !== 'router' && after[key] !== before[key])).toEqual([]);
  });

  it('replaces a legacy timestamp range with the drive containing it', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { history } = create(`/${DONGLE}`);
    history.push(`/${DONGLE}/${DRIVE_START}/${DRIVE_START + 60_000}`);
    await vi.waitFor(() => expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`));
    expect(history.length).toBe(2);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, DRIVE_START, DRIVE_START + 60_000);
  });

  it('ignores a legacy lookup that returns after the URL changed', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { history } = create(`/${DONGLE}/${DRIVE_START}/${DRIVE_START + 60_000}`);
    history.push(`/${DONGLE}`);
    history.goBack();
    history.goForward();
    resolve([{ fullname: `${DONGLE}|${LOG}` }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(history.location.pathname).toBe(`/${DONGLE}`);
  });
});
