import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
import { closeModal, openModal, popTimelineRange, pushTimelineRange, selectDevice } from './navigation';
import { driveUrl } from '../url';
import * as Types from './types';

vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => true },
  routes: { getRoutesSegments: vi.fn(async () => []) },
  devices: { fetchDevice: vi.fn(async (dongleId) => ({ dongle_id: dongleId })) },
} }));
vi.mock('../api', () => ({ athena: {}, billing: { getSubscribeInfo: vi.fn(async () => null) } }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('../analytics', () => ({ analyticsMiddleware: () => (next) => (action) => next(action) }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const SECOND_LOG = '2026-08-06--13-00-00';
const drive = { log_id: LOG, fullname: `${DONGLE}|${LOG}`, duration: 60000, events: [] };
const otherDrive = { ...drive, log_id: SECOND_LOG, fullname: `${DONGLE}|${SECOND_LOG}` };

function setup(path = `/${DONGLE}`) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const initial = createInitialState(history.location);
  const state = {
    ...initial,
    device: { dongle_id: DONGLE }, devices: [{ dongle_id: DONGLE }, { dongle_id: OTHER }],
    profile: { id: 'user' }, routes: [drive, otherDrive],
    routeCache: { [LOG]: drive, [SECOND_LOG]: otherDrive },
    routesMeta: { dongleId: DONGLE, ...initial.filter }, limit: 5,
    files: { example: { url: 'file' } }, subscription: { id: 'subscription' },
  };
  const store = createAppStore(history, state);
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  store.dispatch({ type: LOCATION_CHANGE, payload: { location: history.location, action: history.action } });
  return { history, store };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.routes.getRoutesSegments.mockReset().mockResolvedValue([]);
  localStorage.clear();
});

describe('URL to state', () => {
  it.each(['push', 'replace'])('handles %s with the same reducer as back and forward', (method) => {
    const { history, store } = setup();
    history[method](driveUrl(DONGLE, LOG, { start: 0, end: 20000 }));
    expect(store.getState()).toMatchObject({ navigation: { routeId: LOG }, zoom: { start: 0, end: 20000 }, currentRoute: drive });
    history.push(`/${DONGLE}/prime`);
    expect(store.getState().navigation.page).toBe('prime');
    expect(store.getState().currentRoute).toBeNull();
    const length = history.length;
    history.goBack();
    expect(store.getState().currentRoute).toBe(drive);
    history.goForward();
    expect(store.getState().navigation.page).toBe('prime');
    expect(history.length).toBe(length);
  });

  it('preserves caches and playback when only the modal or unrelated query changes', () => {
    const { history, store } = setup(driveUrl(DONGLE, LOG));
    store.dispatch({ type: Types.ACTION_SEEK, offset: 12000 });
    store.dispatch({ type: Types.ACTION_PAUSE });
    const before = store.getState();
    store.dispatch(openModal('settings', OTHER));
    history.replace({ ...history.location, search: history.location.search + '&extra=value' });
    const after = store.getState();
    for (const key of ['routes', 'routeCache', 'currentRoute', 'filter', 'files', 'subscription', 'zoom', 'loop', 'offset', 'startTime', 'desiredPlaySpeed']) {
      expect(after[key]).toBe(before[key]);
    }
    expect(after.dongleId).toBe(DONGLE);
    expect(after.navigation.modal.dongleId).toBe(OTHER);
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('preserves data when navigating through dashboard, Prime, referrals, and back to a drive', () => {
    const { history, store } = setup(driveUrl(DONGLE, LOG));
    const before = store.getState();
    for (const path of [`/${DONGLE}`, `/${DONGLE}/prime`, '/referrals', driveUrl(DONGLE, LOG)]) history.push(path);
    for (const key of ['routes', 'routeCache', 'filter', 'files', 'subscription']) expect(store.getState()[key]).toBe(before[key]);
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('resets device data while retaining profile and device list', () => {
    const { store } = setup(driveUrl(DONGLE, LOG));
    const before = store.getState();
    store.dispatch(selectDevice(OTHER));
    expect(store.getState()).toMatchObject({ dongleId: OTHER, routes: null, currentRoute: null, routeCache: {}, files: null, subscription: null, zoom: null, loop: null });
    expect(store.getState().devices).toBe(before.devices);
    expect(store.getState().profile).toBe(before.profile);
    expect(localStorage.getItem('selectedDongleId')).toBe(OTHER);
  });

  it('resets playback for a different drive even when its duration is equal', () => {
    const { store } = setup(driveUrl(DONGLE, LOG));
    store.dispatch({ type: Types.ACTION_SEEK, offset: 15000 });
    store.dispatch(pushTimelineRange(SECOND_LOG, null, null));
    expect(store.getState()).toMatchObject({ currentRoute: otherDrive, offset: 0, loop: { startTime: 0, duration: 60000 } });
  });

  it('changes range bounds independently and restores full bounds when removed', () => {
    const { history, store } = setup(driveUrl(DONGLE, LOG, { start: 10000, end: 20000 }));
    history.push(driveUrl(DONGLE, LOG, { start: 12000, end: 20000 }));
    expect(store.getState().zoom).toEqual({ start: 12000, end: 20000 });
    history.push(driveUrl(DONGLE, LOG, { start: 12000, end: 25000 }));
    expect(store.getState().loop).toEqual({ startTime: 12000, duration: 13000 });
    history.push(driveUrl(DONGLE, LOG));
    expect(store.getState().zoom).toEqual({ start: 0, end: 60000 });
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('opens and closes nested modal entries through browser history', () => {
    const { history, store } = setup(driveUrl(DONGLE, LOG));
    store.dispatch(openModal('settings', DONGLE));
    store.dispatch(openModal('uploads', DONGLE));
    store.dispatch(closeModal());
    expect(store.getState().navigation.modal.name).toBe('settings');
    store.dispatch(closeModal());
    expect(history.location.pathname).toBe(driveUrl(DONGLE, LOG));
    expect(store.getState().navigation.modal).toBeNull();
    history.goForward();
    expect(store.getState().navigation.modal.name).toBe('settings');
  });

  it('closes a cold modal link without leaving the app or dropping unrelated arguments', () => {
    const { history, store } = setup(`/${DONGLE}?modal=settings&keep=value#anchor`);
    store.dispatch(closeModal());
    expect(history.length).toBe(1);
    expect(history.location).toMatchObject({ pathname: `/${DONGLE}`, search: '?keep=value', hash: '#anchor' });
  });

  it('replaces legacy links and keeps their query arguments', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: drive.fullname }]);
    const { history } = setup(`/${DONGLE}/1000/2000?keep=value`);
    await vi.waitFor(() => expect(history.location.pathname).toBe(driveUrl(DONGLE, LOG)));
    expect(history.length).toBe(1);
    expect(history.location.search).toBe('?keep=value');
  });

  it('ignores a legacy lookup that resolves after leaving its URL', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { history, store } = setup(`/${DONGLE}/1000/2000`);
    history.push('/referrals');
    resolve([{ fullname: drive.fullname }]);
    await Promise.resolve();
    expect(history.location.pathname).toBe('/referrals');
    expect(store.getState().navigation.page).toBe('referrals');
  });

  it('uses history to return through nested timeline ranges and falls back for cold links', () => {
    const { store, history } = setup(driveUrl(DONGLE, LOG));
    store.dispatch(pushTimelineRange(LOG, 10000, 30000));
    store.dispatch(pushTimelineRange(LOG, 15000, 20000));
    store.dispatch(popTimelineRange(LOG));
    expect(store.getState().zoom).toEqual({ start: 10000, end: 30000 });
    store.dispatch(popTimelineRange(LOG));
    expect(history.location.pathname).toBe(driveUrl(DONGLE, LOG));
    const cold = setup(driveUrl(DONGLE, LOG, { start: 10000, end: 20000 }));
    cold.store.dispatch(popTimelineRange(LOG));
    expect(cold.store.getState().zoom).toEqual({ start: 0, end: 60000 });
  });

  it.each([
    [{ start: 50000, end: 90000 }, { start: 50000, end: 60000 }],
    [{ start: 70000, end: 90000 }, { start: 0, end: 60000 }],
  ])('bounds a URL range to the loaded drive duration', (requested, expected) => {
    const { store } = setup(driveUrl(DONGLE, LOG, requested));
    expect(store.getState().zoom).toEqual(expected);
  });

  it('does not add history entries for repeated selections', () => {
    const { store, history } = setup(driveUrl(DONGLE, LOG));
    store.dispatch(pushTimelineRange(LOG, 0, 60000));
    expect(history.length).toBe(1);
    store.dispatch(openModal('settings', DONGLE));
    store.dispatch(openModal('settings', DONGLE));
    expect(history.length).toBe(2);
  });

});
