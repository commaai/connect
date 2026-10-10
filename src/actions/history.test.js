import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createMemoryHistory } from 'history';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { openDialog, closeDialog } from './history';

vi.mock('../api/backend', () => ({ api: { auth: { isAuthenticated: () => false }, routes: { getRoutesSegments: vi.fn(async () => []) } } }));
vi.mock('../utils/navigation', () => ({ hardNavigate: vi.fn() }));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const DRIVE = `/${DONGLE}/${LOG}/0/20`;

function app(path = DRIVE) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const route = { log_id: LOG, fullname: `${DONGLE}|${LOG}`, duration: 60000 };
  const store = createAppStore(history, { ...createInitialState(), dongleId: DONGLE, currentRoute: route,
    selectedRouteId: LOG, routes: [route], zoom: { start: 0, end: 20000 }, desiredPlaySpeed: 0, offset: 1234 });
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  return { history, store };
}

describe('dialog history', () => {
  it('preserves the loaded drive and playback across dialog history', () => {
    const { store, history } = app();
    const before = store.getState();
    store.dispatch(openDialog('settings', { dialogDeviceId: '1111bbbb1111bbbb' }));
    expect(history.location.pathname).toBe(DRIVE);
    expect(history.location.search).toBe('?dialog=settings&device=1111bbbb1111bbbb');
    expect(store.getState().currentRoute).toBe(before.currentRoute);
    expect(store.getState().zoom).toBe(before.zoom);
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(store.getState().offset).toBe(1234);
    store.dispatch(closeDialog());
    expect(history.location.search).toBe('');
    history.goForward();
    expect(history.location.search).toContain('dialog=settings');
  });

  it('dismisses a direct link without leaving connect', () => {
    const { store, history } = app(`${DRIVE}?ci=1&dialog=settings#position`);
    store.dispatch(closeDialog());
    expect(history.length).toBe(1);
    expect(history.location.pathname).toBe(DRIVE);
    expect(history.location.search).toBe('?ci=1');
    expect(history.location.hash).toBe('#position');
  });

  it('returns a nested dialog to the settings dialog that opened it', () => {
    const { store, history } = app(`${DRIVE}?dialog=settings`);
    store.dispatch(openDialog('unpair', { parent: 'settings' }));
    store.dispatch(closeDialog());
    expect(history.location.search).toBe('?dialog=settings');
  });
});
