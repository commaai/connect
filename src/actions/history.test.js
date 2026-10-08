/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createMemoryHistory } from 'history';

import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import { createAppStore } from '../store';
import { pause, seek } from '../timeline/playback';
import { webrtcConnectionManager } from '../utils/webrtc';

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: vi.fn() },
    routes: { getRoutesSegments: vi.fn() },
  },
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '0000010a--a51155e496';
const START = Date.UTC(2026, 7, 6, 12);

function makeRoute(dongleId) {
  return {
    fullname: `${dongleId}|${LOG}`,
    url: 'https://routes.example.com',
    create_time: START,
    start_time_utc_millis: START,
    end_time_utc_millis: START + 60000,
    segment_numbers: [0],
    segment_start_times: [START],
    segment_end_times: [START + 60000],
  };
}

function setup(pathname, preloadedState = {}) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, { ...createInitialState(), ...preloadedState });
  const sync = (location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } });
  history.listen(sync);
  sync(history.location, 'POP');
  return { history, store };
}

const routeFetches = () => api.routes.getRoutesSegments.mock.calls;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.auth.isAuthenticated.mockReturnValue(true);
  api.routes.getRoutesSegments.mockImplementation(async (dongleId) => [makeRoute(dongleId)]);
});

describe('history middleware', () => {
  it('preserves the requested modal while resolving the home page', () => {
    const { history } = setup('/?modal=pair', { dongleId: DONGLE });
    expect(history.location.pathname).toBe(`/${DONGLE}`);
    expect(history.location.search).toBe('?modal=pair');
  });

  it('resets playback when changing to an equally sized drive', async () => {
    const { history, store } = setup(`/${DONGLE}/${LOG}`);
    await vi.waitFor(() => expect(store.getState().currentRoute).not.toBeNull());
    store.dispatch(pause());
    store.dispatch(seek(30000));
    history.push(`/${DONGLE}/0000010b--a51155e496`);
    expect(store.getState().offset).toBe(0);
    expect(store.getState().loop).toBeNull();
  });

  it('applies a ranged drive URL and loops playback over it', async () => {
    const { store } = setup(`/${DONGLE}/${LOG}/10/20`);
    expect(store.getState()).toMatchObject({
      dongleId: DONGLE,
      nav: { page: 'drive', logId: LOG },
      zoom: { start: 10000, end: 20000 },
      loop: { startTime: 10000, duration: 10000 },
    });
    expect(routeFetches()).toEqual([[DONGLE, undefined, undefined, undefined, `${DONGLE}|${LOG}`]]);
    await vi.waitFor(() => expect(store.getState().currentRoute?.log_id).toBe(LOG));
  });

  it('ignores an obsolete fetch without starting a duplicate for the current drive', async () => {
    let finishFirst;
    let finishSecond;
    api.routes.getRoutesSegments
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishSecond = resolve; }));
    const { history, store } = setup(`/${DONGLE}/${LOG}`);
    history.push(`/${OTHER}/${LOG}`);
    finishFirst([makeRoute(DONGLE)]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(routeFetches()).toHaveLength(2);
    finishSecond([makeRoute(OTHER)]);
    await vi.waitFor(() => expect(store.getState().currentRoute?.fullname).toBe(`${OTHER}|${LOG}`));
  });

  it('opens a drive from the loaded list without fetching it again', async () => {
    const { history, store } = setup(`/${DONGLE}`);
    await vi.waitFor(() => expect(store.getState().routes).toHaveLength(1));
    history.push(`/${DONGLE}/${LOG}`);
    expect(store.getState()).toMatchObject({ currentRoute: { log_id: LOG }, zoom: { start: 0, end: 60000 } });
    expect(routeFetches()).toHaveLength(1);
  });

  it('loads the drive list after closing a drive opened from a link', async () => {
    const { history, store } = setup(`/${DONGLE}/${LOG}`);
    await vi.waitFor(() => expect(store.getState().currentRoute).not.toBeNull());
    history.push(`/${DONGLE}`);
    expect(store.getState()).toMatchObject({ currentRoute: null, zoom: null, loop: null });
    expect(routeFetches()[1]).toEqual([DONGLE, expect.any(Number), expect.any(Number), 5]);
  });

  it('only fetches public drives for signed-out visitors', () => {
    api.auth.isAuthenticated.mockReturnValue(false);
    const { history } = setup(`/${DONGLE}`);
    expect(routeFetches()).toEqual([]);
    history.push(`/${DONGLE}/${LOG}`);
    expect(routeFetches()).toHaveLength(1);
  });

  it('switching devices disconnects the stream and remembers the device', async () => {
    const { history, store } = setup(`/${DONGLE}`);
    await vi.waitFor(() => expect(store.getState().routes).not.toBeNull());
    expect(webrtcConnectionManager.disconnect).not.toHaveBeenCalled();
    history.push(`/${OTHER}`);
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledOnce();
    expect(localStorage.getItem('selectedDongleId')).toBe(OTHER);
    expect(store.getState()).toMatchObject({ dongleId: OTHER, routes: null });
  });

  it('keeps the device while visiting device-less pages', () => {
    const { history, store } = setup(`/${DONGLE}`);
    history.push('/referrals');
    expect(store.getState()).toMatchObject({ dongleId: DONGLE, nav: { page: 'referrals' } });
  });

  it('resolves the home page to the selected device', () => {
    const { history } = setup('/', { dongleId: DONGLE });
    expect(history.location.pathname).toBe(`/${DONGLE}`);
    expect(history.length).toBe(1);
  });

  it('replaces a legacy timestamp URL with its drive', async () => {
    const { history } = setup(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(history.length).toBe(1);
    expect(routeFetches()).toHaveLength(2);
    expect(routeFetches()[0]).toEqual([DONGLE, 1000, 2000]);
  });

  it('ignores a legacy lookup that finishes after leaving the page', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const { history } = setup(`/${DONGLE}/1000/2000`);
    history.push('/referrals');
    resolve([makeRoute(DONGLE)]);
    await new Promise((r) => setTimeout(r, 0));
    expect(history.location.pathname).toBe('/referrals');
  });

  it.each([['empty', async () => []], ['failed', async () => { throw new Error('lookup failed'); }]])('keeps a legacy URL after an %s lookup', async (_name, lookup) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.routes.getRoutesSegments.mockImplementation(lookup);
    const { history } = setup(`/${DONGLE}/1000/2000`);
    await new Promise((r) => setTimeout(r, 0));
    expect(history.location.pathname).toBe(`/${DONGLE}/1000/2000`);
    consoleError.mockRestore();
  });
});
