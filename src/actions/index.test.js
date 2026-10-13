import { createMemoryHistory } from 'history';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { LOCATION_CHANGE } from 'connected-react-router';
import { navigate, pushTimelineRange, popTimelineRange, primeNav, streamNav, openDialog, closeDialog } from './index';

vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

function create(pathname = '/' + DONGLE) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState(history.location));
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  return { history, store };
}

describe('navigation actions', () => {
  it('writes a zero-start fractional range and lets history apply it', () => {
    const { store, history } = create();
    store.dispatch(pushTimelineRange(LOG, 0, 20125));
    expect(history.location.pathname).toBe('/' + DONGLE + '/' + LOG + '/0/20.125');
    expect(store.getState().navigation.range).toEqual({ start: 0, end: 20125 });
  });

  it('uses the specified device when navigating to Prime from settings', () => {
    const { store, history } = create('/' + DONGLE + '/' + LOG);
    store.dispatch(primeNav(true, '1111bbbb1111bbbb'));
    expect(history.location.pathname).toBe('/1111bbbb1111bbbb/prime');
    expect(store.getState()).toMatchObject({ currentRoute: null, zoom: null, navigation: { page: 'prime' } });
  });

  it('unwinds nested ranges through their history entries, including after a dialog', () => {
    const path = '/' + DONGLE + '/' + LOG;
    const { store, history } = create(path + '?ci=1#video');
    store.dispatch(pushTimelineRange(LOG, 0, 20125));
    store.dispatch(pushTimelineRange(LOG, 1250, 10000));
    store.dispatch(openDialog('settings'));
    store.dispatch(closeDialog());
    store.dispatch(popTimelineRange());
    expect(history.location.pathname).toBe(path + '/0/20.125');
    expect(history.location.search).toBe('?ci=1');
    expect(history.location.hash).toBe('#video');
    store.dispatch(popTimelineRange());
    expect(history.location.pathname).toBe(path);
    history.goForward();
    expect(history.location.pathname).toBe(path + '/0/20.125');
    history.goForward();
    expect(history.location.pathname).toBe(path + '/1.25/10');
    expect(store.getState().navigation.range).toEqual({ start: 1250, end: 10000 });
  });

  it('returns a cold range to its whole drive instead of following unrelated history', () => {
    const { store, history } = create('/referrals');
    const path = '/' + DONGLE + '/' + LOG;
    history.push(path + '/0/20.125?ci=1#video');
    store.dispatch(popTimelineRange());
    expect(history.location.pathname).toBe(path);
    expect(history.location.search).toBe('?ci=1');
    expect(history.location.hash).toBe('#video');
    expect(history.index).toBe(2);
  });

  it('writes stream and dashboard locations', () => {
    const { store, history } = create();
    store.dispatch(streamNav(true));
    expect(history.location.pathname).toBe('/' + DONGLE + '/stream');
    store.dispatch(streamNav(false));
    expect(history.location.pathname).toBe('/' + DONGLE);
  });

  it('does not create redundant history entries', () => {
    const { store, history } = create();
    store.dispatch(navigate({ page: 'device', dongleId: DONGLE }));
    expect(history.length).toBe(1);
  });

  it('closes an app-opened dialog with Back', () => {
    const { store, history } = create();
    store.dispatch(openDialog('settings'));
    expect(history.length).toBe(2);
    store.dispatch(closeDialog());
    expect(history.index).toBe(0);
    expect(store.getState().navigation.dialog).toBeNull();
    history.goForward();
    expect(store.getState().navigation.dialog).toBe('settings');
  });

  it('replaces a cold nested dialog with its parent', () => {
    const { store, history } = create('/' + DONGLE + '?ci=1&dialog=unpair#anchor');
    store.dispatch(closeDialog('settings'));
    expect(history.length).toBe(1);
    expect(history.location.search).toBe('?ci=1&dialog=settings');
    expect(history.location.hash).toBe('#anchor');
    expect(store.getState().navigation.dialog).toBe('settings');
  });
});
