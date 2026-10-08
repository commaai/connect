import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { applyLocation } from './history';
import { openDialog, closeDialog } from './navigation';

const mocks = vi.hoisted(() => ({ routes: vi.fn() }));
vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => true },
  routes: { getRoutesSegments: mocks.routes },
  devices: { fetchDevice: vi.fn(async () => ({})) },
} }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

const D = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const route = { fullname: `${D}|${LOG}`, log_id: LOG, duration: 60000 };
function create(path = `/${D}/${LOG}`, extra = {}) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const state = { ...createInitialState(), dongleId: D, devices: [{ dongle_id: D }],
    routes: [route], selectedRouteId: LOG, currentRoute: route,
    zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 },
    ...extra,
  };
  state.routesMeta = { dongleId: D, ...state.filter };
  const store = createAppStore(history, state);
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  store.dispatch({ type: LOCATION_CHANGE, payload: { location: history.location, action: 'POP' } });
  return { history, store };
}
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mocks.routes.mockResolvedValue([]); });

describe('URL -> selection', () => {
  it.each(['push', 'replace'])('applies %s URLs and browser Back/Forward through one flow', (method) => {
    const { history, store } = create();
    history[method](`/${D}/${LOG}/0/0.25`);
    expect(store.getState().zoom).toEqual({ start: 0, end: 250 });
    history.push(`/${D}/${LOG}/0.05/0.125`);
    expect(store.getState().zoom).toEqual({ start: 50, end: 125 });
    history.goBack();
    expect(store.getState().zoom).toEqual({ start: 0, end: 250 });
    history.goForward();
    expect(store.getState().zoom).toEqual({ start: 50, end: 125 });
  });
  it('reuses routes, files and speed for query-only navigation', () => {
    const files = { camera: 'url' };
    const { store } = create(undefined, { files, desiredPlaySpeed: 2 });
    const before = store.getState();
    store.dispatch(openDialog('settings', D));
    expect(store.getState()).toMatchObject({ desiredPlaySpeed: 2, selectedRouteId: LOG });
    expect(store.getState().routes).toBe(before.routes);
    expect(store.getState().currentRoute).toBe(before.currentRoute);
    expect(store.getState().files).toBe(files);
    expect(mocks.routes).not.toHaveBeenCalled();
    store.dispatch(closeDialog());
    expect(store.getState().router.location.search).toBe('');
  });
  it('closes a cold dialog with replace, preserving the underlying drive', () => {
    const { history, store } = create(`/${D}/${LOG}?dialog=settings&device=${D}&ci=1#test`);
    store.dispatch(closeDialog());
    expect(history.length).toBe(1);
    expect(history.location).toMatchObject({ pathname: `/${D}/${LOG}`, search: '?ci=1', hash: '#test' });
  });
  it('does not reset files or speed when changing range', () => {
    const files = {};
    const { history, store } = create(undefined, { files, desiredPlaySpeed: 2 });
    history.push(`/${D}/${LOG}/0/10`);
    expect(store.getState().files).toBe(files);
    expect(store.getState().desiredPlaySpeed).toBe(2);
  });
  it('clears the selected drive when a direct link navigates to Prime or referrals', () => {
    const { history, store } = create();
    history.push(`/${D}/prime`);
    expect(store.getState()).toMatchObject({ selectedRouteId: null, zoom: null });
    history.goBack();
    expect(store.getState().selectedRouteId).toBe(LOG);
    history.push('/referrals');
    expect(store.getState().selectedRouteId).toBeNull();
  });
  it('ignores an obsolete legacy lookup even after returning to the same URL', async () => {
    let resolve;
    mocks.routes.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { history, store } = create(`/${D}/1000/2000`);
    history.push(`/${D}`);
    history.goBack();
    resolve([{ fullname: `${D}|${LOG}` }]);
    await Promise.resolve();
    expect(history.location.pathname).toBe(`/${D}/1000/2000`);
    await store.dispatch(applyLocation());
  });
  it('replaces a legacy timestamp URL rather than adding a Back trap', async () => {
    mocks.routes.mockResolvedValue([{ fullname: `${D}|${LOG}` }]);
    const { history } = create(`/${D}/1000/2000`);
    await vi.waitFor(() => expect(history.location.pathname).toBe(`/${D}/${LOG}`));
    expect(history.length).toBe(1);
  });
});
