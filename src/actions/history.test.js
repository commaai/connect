import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createMemoryHistory } from 'history';

import { api } from '../api/backend';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { closeModal, navigate, openModal } from './history';
import * as Types from './types';

vi.mock('../api/backend', () => ({
  api: { routes: { getRoutesSegments: vi.fn() } },
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

// A store whose history changes are fed back as LOCATION_CHANGE, like ConnectedRouter does.
function create(url) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const store = createAppStore(history, createInitialState());
  const onLocationChanged = (location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } });
  history.listen(onLocationChanged);
  onLocationChanged(history.location, history.action);
  return { history, store };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { store } = create('/');
    expect(() => store.dispatch(undefined)).not.toThrow();
  });

  it.each([
    ['/', { dongleId: null, page: null, selectedRouteId: null, zoom: null }],
    ['/referrals', { dongleId: null, page: 'referrals' }],
    [`/${DONGLE}`, { dongleId: DONGLE, page: null, selectedRouteId: null, zoom: null }],
    [`/${DONGLE}/prime`, { dongleId: DONGLE, page: 'prime' }],
    [`/${DONGLE}/stream`, { dongleId: DONGLE, page: 'stream' }],
    [`/${DONGLE}?modal=settings`, { dongleId: DONGLE, page: null, modal: 'settings' }],
    ['/?modal=pair', { dongleId: null, modal: 'pair' }],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, selectedRouteId: LOG, zoom: null }],
    [`/${DONGLE}/${LOG}/10/20`, { dongleId: DONGLE, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } }],
  ])('applies the initial location %s', (pathname, expected) => {
    expect(create(pathname).store.getState()).toMatchObject(expected);
  });

  it('applies pushed, popped and replaced locations', () => {
    const { history, store } = create(`/${DONGLE}`);
    history.push(`/${OTHER}/prime`);
    expect(store.getState()).toMatchObject({ dongleId: OTHER, page: 'prime' });
    history.goBack();
    expect(store.getState()).toMatchObject({ dongleId: DONGLE, page: null });
    history.replace(`/${DONGLE}/${LOG}/10/20`);
    expect(store.getState()).toMatchObject({ selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
  });

  it('keeps the selected device on pages without one', () => {
    const { history, store } = create(`/${DONGLE}`);
    history.push('/referrals');
    expect(store.getState()).toMatchObject({ dongleId: DONGLE, page: 'referrals' });
  });

  it.each([
    [`/${DONGLE}/`, `/${DONGLE}`],
    [`/${DONGLE}/junk`, `/${DONGLE}`],
    [`/${DONGLE}/prime/`, `/${DONGLE}/prime`],
    [`/${DONGLE}/${LOG}/10/20/30`, `/${DONGLE}/${LOG}`],
    [`/${DONGLE}/${LOG}/20/10?modal=settings`, `/${DONGLE}/${LOG}?modal=settings`],
  ])('rewrites %s as %s', (url, expected) => {
    const { history, store } = create(url);
    expect(history.location.pathname + history.location.search).toBe(expected);
    expect(history.length).toBe(1);
    expect(store.getState().dongleId).toBe(DONGLE);
  });

  it('reuses state when the location is unchanged', () => {
    const { history, store } = create(`/${DONGLE}/${LOG}/10/20`);
    const { zoom, routes, filter } = store.getState();
    history.push(`/${DONGLE}/${LOG}/10/20`);
    expect(store.getState()).toMatchObject({ zoom, routes, filter });
    expect(store.getState().zoom).toBe(zoom);
  });

  it('walks zoom history in both directions', () => {
    const { history, store } = create(`/${DONGLE}/${LOG}`);
    history.push(`/${DONGLE}/${LOG}/10/50`);
    history.push(`/${DONGLE}/${LOG}/20/30`);
    history.goBack();
    expect(store.getState().zoom).toMatchObject({ start: 10000, end: 50000 });
    history.goForward();
    expect(store.getState().zoom).toMatchObject({ start: 20000, end: 30000, previous: { start: 10000, end: 50000 } });
    history.goBack();
    expect(store.getState().zoom).toMatchObject({ start: 10000, end: 50000 });
    expect(store.getState().zoom.previous).toBeNull();
    history.goBack();
    expect(store.getState().zoom).toBeNull();
  });

  describe('legacy timestamp ranges', () => {
    const legacy = `/${DONGLE}/1000/2000`;

    it('replaces the location with the drive found', async () => {
      api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
      const { history, store } = create(legacy);
      await vi.waitFor(() => expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`));
      expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
      expect(history.length).toBe(1);
      expect(store.getState().selectedRouteId).toBe(LOG);
    });

    it.each([
      ['nothing is found', () => Promise.resolve([])],
      ['the lookup fails', () => Promise.reject(new Error('lookup failed'))],
    ])('stays when %s', async (_name, lookup) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = lookup();
      api.routes.getRoutesSegments.mockReturnValue(result);
      const { history } = create(legacy);
      await result.catch(() => {});
      expect(history.location.pathname).toBe(legacy);
      consoleError.mockRestore();
    });

    it('does not redirect after navigating away', async () => {
      const result = Promise.resolve([{ fullname: `${DONGLE}|${LOG}` }]);
      api.routes.getRoutesSegments.mockReturnValue(result);
      const { history } = create(legacy);
      history.push(`/${DONGLE}/prime`);
      await result;
      expect(history.location.pathname).toBe(`/${DONGLE}/prime`);
    });
  });
});

describe('navigate', () => {
  it.each([
    ['the dashboard', {}, `/${DONGLE}`],
    ['a page', { page: 'prime' }, `/${DONGLE}/prime`],
    ['a dialog', { modal: 'settings' }, `/${DONGLE}?modal=settings`],
    ['referrals', { page: 'referrals' }, '/referrals'],
    ['another device', { dongleId: OTHER }, `/${OTHER}`],
    ['a page of another device', { dongleId: OTHER, page: 'prime' }, `/${OTHER}/prime`],
    ['a drive', { routeId: LOG }, `/${DONGLE}/${LOG}`],
    ['part of a drive', { routeId: LOG, range: { start: 10500, end: 20500 } }, `/${DONGLE}/${LOG}/10/20`],
  ])('goes to %s on the selected device', (_name, location, expected) => {
    const { history, store } = create(`/${DONGLE}/stream`);
    store.dispatch(navigate(location));
    expect(history.location.pathname + history.location.search).toBe(expected);
    expect(history.length).toBe(2);
  });

  it('can replace the current entry', () => {
    const { history, store } = create(`/${DONGLE}?modal=pair`);
    store.dispatch(navigate({ dongleId: OTHER }, { replace: true }));
    expect(history.location.pathname + history.location.search).toBe(`/${OTHER}`);
    expect(history.length).toBe(1);
  });

  it('does not push the current location again', () => {
    const { history, store } = create(`/${DONGLE}/prime`);
    store.dispatch(navigate({ page: 'prime' }));
    expect(history.length).toBe(1);
  });

  it('writes a range covering the whole drive as the drive', () => {
    const { history, store } = create(`/${DONGLE}/${LOG}/10/20`);
    store.dispatch({
      type: Types.ACTION_ROUTES_METADATA,
      dongleId: DONGLE,
      start: 0,
      end: 1,
      routes: [{ fullname: `${DONGLE}|${LOG}`, log_id: LOG, duration: 60000 }],
    });
    store.dispatch(navigate({ routeId: LOG, range: { start: 0, end: 60000 } }));
    expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`);
    expect(store.getState().zoom).toMatchObject({ start: 0, end: 60000 });
  });
});

describe('dialogs', () => {
  it('open over the current page and close with back', () => {
    const { history, store } = create(`/${DONGLE}/${LOG}/10/20`);
    const { zoom } = store.getState();
    store.dispatch(openModal('settings'));
    expect(history.location.pathname + history.location.search).toBe(`/${DONGLE}/${LOG}/10/20?modal=settings`);
    expect(store.getState()).toMatchObject({ modal: 'settings', selectedRouteId: LOG });
    expect(store.getState().zoom).toBe(zoom);
    store.dispatch(closeModal());
    expect(history.location.pathname + history.location.search).toBe(`/${DONGLE}/${LOG}/10/20`);
    expect(history.index).toBe(0);
    expect(store.getState().modal).toBeNull();
  });

  it('opened from a link close in place', () => {
    const { history, store } = create(`/${DONGLE}?modal=settings`);
    store.dispatch(closeModal());
    expect(history.location.pathname + history.location.search).toBe(`/${DONGLE}`);
    expect(history.length).toBe(1);
    expect(store.getState().modal).toBeNull();
  });

  it('close when navigating away', () => {
    const { store } = create(`/${DONGLE}?modal=settings`);
    store.dispatch(navigate({ page: 'prime' }));
    expect(store.getState()).toMatchObject({ page: 'prime', modal: null });
  });
});

// Getting to a URL from anywhere, forwards or back, leaves the same state as loading it.
describe('every pair of locations', () => {
  const URLS = [
    '/',
    '/referrals',
    '/?modal=pair',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}?modal=settings`,
    `/${DONGLE}?modal=filter`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/10/20`,
    `/${DONGLE}/${LOG}/10/20?modal=settings`,
    `/${OTHER}`,
    `/${OTHER}/${LOG}/30/40`,
  ];
  const pairs = URLS.flatMap((from) => URLS.filter((to) => to !== from).map((to) => [from, to]));

  const nav = ({ dongleId, page, modal, selectedRouteId, zoom }) => ({
    dongleId, page, modal, selectedRouteId, zoom: zoom && { start: zoom.start, end: zoom.end },
  });
  // a location without a device keeps whichever one was selected before
  const loaded = (url, selected = null) => {
    const state = nav(create(url).store.getState());
    return { ...state, dongleId: state.dongleId ?? selected };
  };

  it('match loading the URL', () => {
    for (const [from, to] of pairs) {
      const { history, store } = create(from);
      history.push(to);
      const there = nav(store.getState());
      expect(there, `${from} -> ${to}`).toEqual(loaded(to, loaded(from).dongleId));
      history.goBack();
      expect(nav(store.getState()), `${from} -> ${to} -> back`).toEqual(loaded(from, there.dongleId));
    }
  });
});
