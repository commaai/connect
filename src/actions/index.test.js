import { vi } from 'vitest';
import { push } from 'connected-react-router';
import {
  popTimelineRange, primeNav, pushTimelineRange, resolveLegacyZoom, selectDevice, streamNav,
} from './index';
import { api } from '../api/backend';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  selectLoop: vi.fn(),
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn(),
  };
});

vi.mock('../api/backend', () => ({
  api: { routes: { getRoutesSegments: vi.fn() } },
  initBackend: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const baseState = {
  dongleId: DONGLE,
  loop: null,
  zoom: null,
  currentRoute: null,
  selectedRouteId: null,
  primeNav: false,
  streamNav: false,
  profile: null,
  devices: null,
  device: null,
  routes: [],
  routesMeta: { dongleId: DONGLE, start: 0, end: 0 },
  filter: { start: 0, end: 0 },
  limit: 0,
  router: { location: { pathname: '/', search: '' } },
};

function mockStore(overrides = {}) {
  const state = { ...baseState, ...overrides };
  return { dispatch: vi.fn(), getState: vi.fn(() => state) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('navigation actions', () => {
  it('pushes the canonical URL when entering a drive range', () => {
    const { dispatch, getState } = mockStore();
    pushTimelineRange(LOG, 123000, 456000)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}/123/456`);
  });

  it('serializes a zero-start range explicitly', () => {
    const { dispatch, getState } = mockStore();
    pushTimelineRange(LOG, 0, 30000)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}/0/30`);
  });

  it('omits the range for a whole-drive zoom', () => {
    const { dispatch, getState } = mockStore({ currentRoute: { log_id: LOG, duration: 60000 } });
    pushTimelineRange(LOG, 0, 60000)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}`);
  });

  it('does not push when the URL already matches', () => {
    const { dispatch, getState } = mockStore({
      selectedRouteId: LOG,
      zoom: { start: 123000, end: 456000 },
      router: { location: { pathname: `/${DONGLE}/${LOG}/123/456`, search: '' } },
    });
    pushTimelineRange(LOG, 123000, 456000)(dispatch, getState);
    expect(push).not.toHaveBeenCalled();
  });

  it('preserves overlay query params when syncing the URL', () => {
    const { dispatch, getState } = mockStore({
      router: { location: { pathname: `/${DONGLE}`, search: `?settings=${DONGLE}` } },
    });
    pushTimelineRange(LOG, 1000, 2000)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}/1/2?settings=${DONGLE}`);
  });

  it('drops the one-time pair token when syncing the URL', () => {
    // ?pair= is a boot token, not nav state: navigating with it in the URL
    // must not carry it forward, or a refresh would re-run the pair flow.
    const { dispatch, getState } = mockStore({
      router: { location: { pathname: `/${DONGLE}`, search: '?pair=spent-token' } },
    });
    pushTimelineRange(LOG, 1000, 2000)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}/1/2`);
  });

  it('keeps the settings overlay but drops pair and login-redirect params', () => {
    const { dispatch, getState } = mockStore({
      router: { location: { pathname: `/${DONGLE}`, search: `?settings=${DONGLE}&pair=t&r=%2F${DONGLE}` } },
    });
    pushTimelineRange(LOG, 1000, 2000)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}/1/2?settings=${DONGLE}`);
  });

  it.each([
    ['prime', primeNav, 'primeNav', `/${DONGLE}/prime`],
    ['stream', streamNav, 'streamNav', `/${DONGLE}/stream`],
  ])('pushes the %s URL when opening', (_name, action, _key, expected) => {
    const { dispatch, getState } = mockStore();
    action(true)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('pushes the device URL when leaving prime', () => {
    const { dispatch, getState } = mockStore({ primeNav: true });
    primeNav(false)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(`/${DONGLE}`);
  });

  it('pushes the device URL on selectDevice and drops the settings overlay', () => {
    const { dispatch, getState } = mockStore({
      router: { location: { pathname: '/', search: `?settings=${DONGLE}` } },
    });
    selectDevice(DONGLE)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(`/${DONGLE}`);
  });

  it('syncs the URL to the popped zoom', () => {
    const { dispatch, getState } = mockStore({
      selectedRouteId: LOG,
      zoom: { start: 10000, end: 20000, previous: { start: 0, end: 60000 } },
      currentRoute: { log_id: LOG, duration: 60000 },
      router: { location: { pathname: `/${DONGLE}/${LOG}/10/20`, search: '' } },
    });
    popTimelineRange(LOG)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}`);
  });

  it('does nothing when popping without a previous zoom', () => {
    const { dispatch, getState } = mockStore({
      selectedRouteId: LOG,
      zoom: { start: 0, end: 60000 },
    });
    popTimelineRange(LOG)(dispatch, getState);
    expect(dispatch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('resolveLegacyZoom', () => {
  const legacyLocation = { pathname: `/${DONGLE}/1000/2000`, search: '' };

  function legacyStore(location = legacyLocation) {
    const state = {
      ...baseState,
      router: { location },
    };
    const getState = vi.fn(() => state);
    // execute thunks like a real store so nested navigation runs
    const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, getState) : action));
    return { dispatch, getState };
  }

  it('converts a legacy range to the canonical route URL', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{
      fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000,
    }]);
    const { dispatch, getState } = legacyStore();
    resolveLegacyZoom(DONGLE, 1000, 2000)(dispatch, getState);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}/0/60`));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it('does nothing when the lookup is empty', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([]);
    const { dispatch, getState } = legacyStore();
    resolveLegacyZoom(DONGLE, 1000, 2000)(dispatch, getState);
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
    expect(dispatch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('ignores a stale lookup after navigation', async () => {
    let resolveLookup;
    api.routes.getRoutesSegments.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    const { dispatch, getState } = legacyStore();
    resolveLegacyZoom(DONGLE, 1000, 2000)(dispatch, getState);
    // user navigates away before the lookup resolves
    getState.mockReturnValue({
      ...baseState,
      router: { location: { pathname: `/${DONGLE}`, search: '' } },
    });
    resolveLookup([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    expect(dispatch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
