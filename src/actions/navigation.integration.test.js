import { vi } from 'vitest';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { createMemoryHistory } from 'history';
import { connectRouter, LOCATION_CHANGE, routerMiddleware } from 'connected-react-router';

import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import rootReducer from '../reducers';
import { play, seek } from '../timeline/playback';
import { locationWithDialog } from '../url';
import { checkRoutesData, primeNav, pushTimelineRange } from './index';
import { onHistoryMiddleware } from './history';

vi.mock('../api/backend', async () => {
  const { selectBackendType } = await vi.importActual('../api/backend');
  return {
    selectBackendType,
    api: {
      auth: { isAuthenticated: () => true },
      routes: { getRoutesSegments: vi.fn() },
      devices: { fetchDevice: vi.fn() },
    },
  };
});
vi.mock('../api', () => ({ athena: {}, billing: {} }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('../utils/navigation', () => ({ hardNavigate: vi.fn() }));
// These tests own their Redux stores. Playback always receives explicit state.
vi.mock('../store', () => ({ default: { getState: () => { throw new Error('Unexpected global store access'); } } }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const OTHER_LOG = '2026-08-07--12-00-00';

function route(dongleId = DONGLE, logId = LOG) {
  return {
    fullname: `${dongleId}|${logId}`,
    url: 'https://example.test/route',
    create_time: 1000,
    start_time_utc_millis: 1000,
    end_time_utc_millis: 61000,
    segment_start_times: [1000],
    segment_end_times: [61000],
    segment_numbers: [0],
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createNavigation(pathname) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const initialState = {
    ...createInitialState(history.location),
    devices: [DONGLE, OTHER].map((dongleId) => ({ dongle_id: dongleId, shared: true })),
    profile: { superuser: false },
  };
  const store = createStore(connectRouter(history)(rootReducer), initialState,
    applyMiddleware(thunk, onHistoryMiddleware, routerMiddleware(history)));
  const receive = (location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } });
  history.listen(receive);
  receive(history.location, 'POP');
  return { store, history };
}

beforeEach(() => {
  api.routes.getRoutesSegments.mockReset();
  api.routes.getRoutesSegments.mockImplementation(async (dongleId, _start, _end, _limit, fullname) => (
    [route(dongleId, fullname?.split('|')[1] || OTHER_LOG)]
  ));
  localStorage.clear();
});

describe('navigation with real actions, reducers, and memory history', () => {
  it('restores a ranged drive from Prime without adding a history entry or losing Forward', async () => {
    const pathname = `/${DONGLE}/${LOG}/10/20`;
    const { store, history } = createNavigation(pathname);
    await store.dispatch(checkRoutesData());
    store.dispatch(primeNav(true));
    expect(history.location.pathname).toBe(`/${DONGLE}/prime`);
    expect(history.length).toBe(2);

    history.goBack();
    expect(history.location.pathname).toBe(pathname);
    expect(history.length).toBe(2);
    expect(history.index).toBe(0);
    expect(store.getState()).toMatchObject({
      primeNav: false,
      selectedRouteId: LOG,
      currentRoute: { fullname: `${DONGLE}|${LOG}` },
      zoom: { start: 10000, end: 20000 },
      loop: { startTime: 10000, duration: 10000 },
    });

    history.goForward();
    expect(history.location.pathname).toBe(`/${DONGLE}/prime`);
    expect(history.index).toBe(1);
    expect(store.getState()).toMatchObject({ primeNav: true, selectedRouteId: null, currentRoute: null });
  });

  it.each(['prime', 'stream'])('reconciles cross-device %s PUSH, Back, and Forward', (mode) => {
    const { store, history } = createNavigation(`/${DONGLE}/${mode}`);
    history.push(`/${OTHER}/${mode}`);
    expect(store.getState()).toMatchObject({ dongleId: OTHER, [`${mode}Nav`]: true });
    history.goBack();
    expect(store.getState()).toMatchObject({ dongleId: DONGLE, [`${mode}Nav`]: true });
    history.goForward();
    expect(store.getState()).toMatchObject({ dongleId: OTHER, [`${mode}Nav`]: true });
    expect(history.length).toBe(2);
  });

  it('preserves clip, loop, offset, and speed while opening and replaying a dialog', async () => {
    const { store, history } = createNavigation(`/${DONGLE}/${LOG}/0/20`);
    await store.dispatch(checkRoutesData());
    store.dispatch(play(0.5));
    store.dispatch(seek(14000));
    const before = store.getState();
    const playback = {
      selectedRouteId: before.selectedRouteId,
      currentRoute: before.currentRoute,
      zoom: before.zoom,
      loop: before.loop,
      offset: before.offset,
      desiredPlaySpeed: before.desiredPlaySpeed,
    };
    api.routes.getRoutesSegments.mockClear();

    history.push(locationWithDialog(history.location, 'files'));
    expect(store.getState().navigation.dialog).toBe('files');
    expect(store.getState()).toMatchObject(playback);
    history.goBack();
    expect(store.getState().navigation.dialog).toBeNull();
    expect(store.getState()).toMatchObject(playback);
    history.goForward();
    expect(store.getState().navigation.dialog).toBe('files');
    expect(store.getState()).toMatchObject(playback);
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('requests another route on the same device and ignores the earlier response for active selection', async () => {
    const first = deferred();
    const second = deferred();
    api.routes.getRoutesSegments.mockImplementation((_dongleId, _start, _end, _limit, fullname) => (
      fullname === `${DONGLE}|${LOG}` ? first.promise : second.promise
    ));
    const { store, history } = createNavigation(`/${DONGLE}/${LOG}`);
    const firstLoad = store.dispatch(checkRoutesData());
    history.push(`/${DONGLE}/${OTHER_LOG}/0/20`);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, undefined, undefined, undefined, `${DONGLE}|${OTHER_LOG}`);

    second.resolve([route(DONGLE, OTHER_LOG)]);
    await vi.waitFor(() => expect(store.getState().currentRoute?.log_id).toBe(OTHER_LOG));
    first.resolve([route(DONGLE, LOG)]);
    await firstLoad;
    expect(history.location.pathname).toBe(`/${DONGLE}/${OTHER_LOG}/0/20`);
    expect(store.getState()).toMatchObject({
      selectedRouteId: OTHER_LOG,
      currentRoute: { fullname: `${DONGLE}|${OTHER_LOG}` },
      zoom: { start: 0, end: 20000 },
      loop: { startTime: 0, duration: 20000 },
    });
  });

  it('loads the dashboard separately after closing a cold-opened drive', async () => {
    const { store, history } = createNavigation(`/${DONGLE}/${LOG}`);
    await store.dispatch(checkRoutesData());
    expect(store.getState().routes).toBeNull();
    store.dispatch(pushTimelineRange(null, null, null));
    await vi.waitFor(() => expect(store.getState().routes?.[0]?.log_id).toBe(OTHER_LOG));
    expect(history.location.pathname).toBe(`/${DONGLE}`);
    expect(store.getState()).toMatchObject({ selectedRouteId: null, currentRoute: null, limit: 5 });
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, expect.any(Number), expect.any(Number), 5);
  });
});
