import { vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';

import { createInitialState } from '../initialState';
import { createAppStore } from '../store';
import { closeDialog, navigate, navigateToDrive, openDialog } from './index';

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: () => true },
    routes: { getRoutesSegments: vi.fn(async () => []) },
  },
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const ROUTE = { dongle_id: DONGLE, log_id: LOG, duration: 60000 };

function open(pathname) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState());
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  return { history, store };
}

const url = ({ location }) => `${location.pathname}${location.search}`;

describe('navigation', () => {
  it('pushes the URL for a page', () => {
    const { history, store } = open('/');
    store.dispatch(navigate({ page: 'prime', dongleId: DONGLE }));
    expect(url(history)).toBe(`/${DONGLE}/prime`);
    expect(history.action).toBe('PUSH');
  });

  it('does not add a history entry for the page already shown', () => {
    const { history, store } = open(`/${DONGLE}`);
    store.dispatch(navigate({ page: 'dashboard', dongleId: DONGLE }));
    store.dispatch(navigate({ page: 'dashboard', dongleId: DONGLE }));
    expect(history.length).toBe(1);
  });

  it('leaves a dialog when navigating to the page under it', () => {
    const { history, store } = open(`/${DONGLE}?filter`);
    store.dispatch(navigate({ page: 'dashboard', dongleId: DONGLE }));
    expect(url(history)).toBe(`/${DONGLE}`);
  });

  it.each([
    ['the whole drive by default', [], `/${DONGLE}/${LOG}`],
    ['the whole drive when only sub-second edges are cut', [400, 59500], `/${DONGLE}/${LOG}`],
    ['a sub-second range as the second around it', [1200, 1800], `/${DONGLE}/${LOG}/1/2`],
    ['a range rounded outwards to whole seconds', [1900, 2800], `/${DONGLE}/${LOG}/1/3`],
    ['the whole drive when the range covers it', [0, 60000], `/${DONGLE}/${LOG}`],
    ['a range starting at zero', [0, 20000], `/${DONGLE}/${LOG}/0/20`],
    ['a range', [10000, 20000], `/${DONGLE}/${LOG}/10/20`],
    ['a range dragged past the start', [-5000, 20000], `/${DONGLE}/${LOG}/0/20`],
    ['a range dragged past the end', [10000, 90000], `/${DONGLE}/${LOG}/10/60`],
    ['the whole drive when dragged past both ends', [-5000, 90000], `/${DONGLE}/${LOG}`],
  ])('shows %s', (_name, range, expected) => {
    const { history, store } = open(`/${DONGLE}`);
    store.dispatch(navigateToDrive(ROUTE, ...range));
    expect(url(history)).toBe(expected);
  });
});

describe('dialogs', () => {
  it('open on top of the current page, keeping its query', () => {
    const { history, store } = open(`/${DONGLE}/${LOG}/10/20?ci=1`);
    store.dispatch(openDialog('settings', OTHER));
    expect(url(history)).toBe(`/${DONGLE}/${LOG}/10/20?ci=1&settings=${OTHER}`);
  });

  it('close by going back when opened in the app', () => {
    const { history, store } = open(`/${DONGLE}`);
    store.dispatch(openDialog('filter'));
    store.dispatch(closeDialog('filter'));
    expect(url(history)).toBe(`/${DONGLE}`);
    expect(history.length).toBe(1 + 1);
    expect(history.index).toBe(0);
  });

  it('close by replacing the URL when opened from a link', () => {
    const { history, store } = open(`/${DONGLE}?add-device&ci=1`);
    store.dispatch(closeDialog('add-device'));
    expect(url(history)).toBe(`/${DONGLE}?ci=1`);
    expect(history.length).toBe(1);
  });

  it('close only themselves when stacked', () => {
    const { history, store } = open(`/${DONGLE}`);
    store.dispatch(openDialog('settings', DONGLE));
    store.dispatch(openDialog('add-device'));
    store.dispatch(closeDialog('add-device'));
    expect(url(history)).toBe(`/${DONGLE}?settings=${DONGLE}`);
  });
});
