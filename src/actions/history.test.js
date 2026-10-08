import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { pushTimelineRange, popTimelineRange } from './index';
import { openModal, closeModal } from './navigation';
import { api } from '../api/backend';
import { play, seek } from '../timeline/playback';
import { getDefaultFilter } from '../utils/filter';

vi.mock('../analytics', () => ({ analyticsMiddleware: () => (next) => (action) => next(action) }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => true },
  routes: { getRoutesSegments: vi.fn(async () => []) },
  devices: { fetchDevice: vi.fn(async () => ({})) },
} }));

const DONGLE = 'aaaaaaaaaaaaaaaa';
const LOG = '0000010a--a51155e496';
const DRIVE = `/${DONGLE}/${LOG}`;
const route = { log_id: LOG, fullname: `${DONGLE}|${LOG}`, duration: 60000 };

function setup(path = DRIVE, extra = {}) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const state = {
    ...createInitialState(path), routes: [route], routeCache: { [LOG]: route }, currentRoute: path.includes(LOG) ? route : null,
    files: { camera: { url: 'cached' } }, limit: 5,
    routesMeta: { dongleId: DONGLE, start: 0, end: Number.MAX_SAFE_INTEGER },
    ...extra,
  };
  const store = createAppStore(history, state);
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  store.dispatch({ type: LOCATION_CHANGE, payload: { location: history.location, action: 'POP' } });
  return { store, history };
}

beforeEach(() => { vi.clearAllMocks(); api.routes.getRoutesSegments.mockResolvedValue([]); localStorage.clear(); });

describe('URL reconciliation', () => {
  it('applies PUSH, REPLACE and POP to the selected drive and zoom', () => {
    const { history, store } = setup(`/${DONGLE}`);
    history.push(`${DRIVE}/0/20`);
    expect(store.getState()).toMatchObject({ selectedRouteId: LOG, zoom: { start: 0, end: 20000 } });
    history.replace(`${DRIVE}/1.001/2.002`);
    expect(store.getState().zoom).toMatchObject({ start: 1001, end: 2002 });
    history.goBack();
    expect(store.getState().selectedRouteId).toBeNull();
  });

  it('keeps cached data and playback untouched when opening/closing an overlay', () => {
    const { store, history } = setup(`${DRIVE}/0/20`);
    const before = store.getState();
    store.dispatch(openModal('settings', DONGLE));
    expect(history.location.search).toContain('modal=settings');
    for (const key of ['routes', 'files', 'zoom', 'loop', 'offset', 'startTime', 'desiredPlaySpeed']) {
      expect(store.getState()[key]).toBe(before[key]);
    }
    store.dispatch(closeModal());
    expect(history.location.search).toBe('');
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it.each(['/invalid/path', '/auth'])('clears a previously selected drive on %s and restores it on Back', (pathname) => {
    const driveRange = `${DRIVE}/10/20`;
    const { history, store } = setup(driveRange);
    const before = store.getState();
    history.push(pathname);
    expect(store.getState()).toMatchObject({ selectedRouteId: null, currentRoute: null, zoom: null, loop: null });
    expect(store.getState().routes).toBe(before.routes);
    expect(store.getState().files).toBe(before.files);
    history.goBack();
    expect(history.location.pathname).toBe(driveRange);
    expect(store.getState()).toMatchObject({ selectedRouteId: LOG, zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 } });
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it.each([0, 2])('keeps playback speed %s when the same drive range changes', (speed) => {
    const { history, store } = setup(DRIVE);
    store.dispatch(play(speed));
    store.dispatch(seek(15000));
    history.push(`${DRIVE}/10/20`);
    expect(store.getState()).toMatchObject({ desiredPlaySpeed: speed, zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 } });
    history.goBack();
    expect(store.getState()).toMatchObject({ desiredPlaySpeed: speed, zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 } });
  });

  it('restores explicit dashboard filters on cold entry and Back without refetching an overlay', () => {
    api.routes.getRoutesSegments.mockReturnValue(new Promise(() => {}));
    const path = `/${DONGLE}?from=1000&to=2000`;
    const { history, store } = setup(path, { limit: 15 });
    expect(store.getState().filter).toEqual({ start: 1000, end: 2000 });
    expect(store.getState().limit).toBe(5);
    const before = store.getState();
    const requests = api.routes.getRoutesSegments.mock.calls.length;
    store.dispatch(openModal('filter'));
    expect(store.getState().filter).toBe(before.filter);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(requests);
    store.dispatch(closeModal());
    history.push(`/${DONGLE}?from=3000&to=4000`);
    expect(store.getState().filter).toEqual({ start: 3000, end: 4000 });
    history.goBack();
    expect(store.getState().filter).toEqual({ start: 1000, end: 2000 });
    history.push(`/${DONGLE}`);
    expect(store.getState().filter).toEqual(getDefaultFilter());
  });

  it('keeps dashboard filter context distinct from the selected drive range', () => {
    const { history, store } = setup(`${DRIVE}/10/20?from=1000&to=2000`);
    expect(store.getState()).toMatchObject({ filter: { start: 1000, end: 2000 }, zoom: { start: 10000, end: 20000 } });
    history.push(`${DRIVE}/20/30`);
    expect(store.getState()).toMatchObject({ filter: { start: 1000, end: 2000 }, zoom: { start: 20000, end: 30000 } });
  });

  it('browser Back restores zoom ancestry instead of adding the future', () => {
    const { history, store } = setup(DRIVE);
    store.dispatch(pushTimelineRange(LOG, 10000, 30000));
    store.dispatch(pushTimelineRange(LOG, 15000, 20000));
    history.goBack();
    expect(store.getState().zoom).toMatchObject({ start: 10000, end: 30000, previous: { start: 0, end: 60000 } });
    store.dispatch(popTimelineRange(LOG));
    expect(history.location.pathname).toBe(DRIVE);
    expect(store.getState().zoom).toMatchObject({ start: 0, end: 60000, previous: null });
  });

  it('does not rebuild files when changing zoom or returning to a cached drive', () => {
    const { history, store } = setup(DRIVE);
    const files = store.getState().files;
    history.push(`${DRIVE}/0/20`);
    history.push(`/${DONGLE}`);
    history.goBack();
    expect(store.getState().files).toBe(files);
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('legacy redirects replace their entry, so Back does not bounce forward', async () => {
    api.routes.getRoutesSegments.mockResolvedValueOnce([{ fullname: `${DONGLE}|${LOG}` }]);
    const { history } = setup(`/${DONGLE}`);
    history.push(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(history.location.pathname).toBe(DRIVE));
    expect(history.length).toBe(2);
    history.goBack();
    expect(history.location.pathname).toBe(`/${DONGLE}`);
  });

  it('stale legacy lookups never replace newer navigation', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { history } = setup(`/${DONGLE}`);
    history.push(`/${DONGLE}/1000/2000`);
    history.push(`/${DONGLE}/prime`);
    resolve([{ fullname: `${DONGLE}|${LOG}` }]);
    await Promise.resolve();
    expect(history.location.pathname).toBe(`/${DONGLE}/prime`);
  });
});
