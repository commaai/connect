import { vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';

import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import { createAppStore } from '../store';
import { checkRoutesData } from './index';

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

  it('never looks up a legacy range too large to be a number', () => {
    const { history, select } = create(`/${DONGLE}`);
    history.push(`/${DONGLE}/1/${'9'.repeat(400)}`);
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
    expect(select()).toEqual({ dongleId: DONGLE, selectedRouteId: null, zoom: null });
  });

  describe('legacy lookups', () => {
    const LINK = `/${DONGLE}/${DRIVE_START}/${DRIVE_START + 60_000}`;
    const OTHER_LINK = `/${DONGLE}/${DRIVE_START + 120_000}/${DRIVE_START + 180_000}`;
    const OTHER_LOG = '2026-08-06--12-02-00';
    const drive = (log) => [{ fullname: `${DONGLE}|${log}` }];
    const settle = () => new Promise((r) => setTimeout(r, 0));
    let lookups;

    beforeEach(() => {
      lookups = [];
      api.routes.getRoutesSegments.mockImplementation(() => new Promise((resolve, reject) => lookups.push({ resolve, reject })));
    });

    it.each([
      ['opened again', (history) => history.push(LINK)],
      ['returned to with Back', (history) => history.goBack()],
    ])('a lookup from an earlier visit does not redirect the link %s', async (_name, returnToLink) => {
      const { history } = create(LINK);
      history.push(`/${DONGLE}`);
      returnToLink(history);
      expect(lookups).toHaveLength(2);
      lookups[0].resolve(drive(OTHER_LOG));
      await settle();
      expect(history.location.pathname).toBe(LINK);
      lookups[1].resolve(drive(LOG));
      await vi.waitFor(() => expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`));
    });

    it('a stale lookup failing does not restart or cancel the lookup for the link on screen', async () => {
      const { history } = create(LINK);
      history.push(OTHER_LINK);
      lookups[0].reject(new Error('stale'));
      await settle();
      history.push(`${OTHER_LINK}?dialog=settings#top`);
      expect(lookups).toHaveLength(2);
      lookups[1].resolve(drive(OTHER_LOG));
      await vi.waitFor(() => expect(history.location.pathname).toBe(`/${DONGLE}/${OTHER_LOG}`));
      expect(history.location).toMatchObject({ search: '?dialog=settings', hash: '#top' });
    });

    it('two stores look up the same link independently', async () => {
      const first = create(LINK);
      const second = create(LINK);
      expect(lookups).toHaveLength(2);
      lookups[1].resolve(drive(LOG));
      await vi.waitFor(() => expect(second.history.location.pathname).toBe(`/${DONGLE}/${LOG}`));
      expect(first.history.location.pathname).toBe(LINK);
      lookups[0].resolve(drive(OTHER_LOG));
      await vi.waitFor(() => expect(first.history.location.pathname).toBe(`/${DONGLE}/${OTHER_LOG}`));
    });
  });
  describe('drive requests', () => {
    const route = (dongleId) => ({
      fullname: `${dongleId}|${LOG}`, url: 'https://routes.example.com', create_time: DRIVE_START,
      segment_numbers: [0], segment_start_times: [DRIVE_START], segment_end_times: [DRIVE_START + 60_000],
      start_time_utc_millis: DRIVE_START, end_time_utc_millis: DRIVE_START + 60_000,
    });
    const settle = () => new Promise((r) => setTimeout(r, 0));
    let requests;

    beforeEach(() => {
      requests = [];
      api.routes.getRoutesSegments.mockImplementation((dongleId) => new Promise((resolve, reject) => {
        requests.push({ dongleId, resolve, reject });
      }));
    });

    it('two stores on the same device each load its drives', () => {
      const first = create(`/${DONGLE}`);
      const second = create(`/${DONGLE}`);
      first.store.dispatch(checkRoutesData());
      second.store.dispatch(checkRoutesData());
      expect(requests.map((r) => r.dongleId)).toEqual([DONGLE, DONGLE]);
    });

    it('a response for a device left behind neither applies nor clears the newest request', async () => {
      const { history, store } = create(`/${DONGLE}`);
      store.dispatch(checkRoutesData());
      history.push(`/${OTHER}`);
      expect(requests.map((r) => r.dongleId)).toEqual([DONGLE, OTHER]);
      requests[0].resolve([route(DONGLE)]);
      await settle();
      store.dispatch(checkRoutesData()); // still pending, so no new request
      expect(requests).toHaveLength(2);
      expect(store.getState().routes).toBe(null);
      requests[1].resolve([route(OTHER)]);
      await vi.waitFor(() => expect(store.getState().routes?.map((r) => r.fullname)).toEqual([`${OTHER}|${LOG}`]));
    });

    it('a dialog neither starts nor retries a request; the next check retries a failed one', async () => {
      const { history, store } = create(`/${DONGLE}`);
      store.dispatch(checkRoutesData());
      history.push(`/${DONGLE}?dialog=settings`);
      expect(requests).toHaveLength(1);
      requests[0].reject(new Error('offline'));
      await settle();
      history.push(`/${DONGLE}?dialog=uploads`);
      expect(requests).toHaveLength(1);
      store.dispatch(checkRoutesData());
      expect(requests).toHaveLength(2);
    });
  });
});
