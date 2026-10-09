import React from 'react';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { ConnectedRouter, push } from 'connected-react-router';
import { createMemoryHistory } from 'history';

// store must load before actions: actions -> timeline/playback -> store is a cycle.
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { closeDialog, navigateTo, showDialog, zoomIn, zoomOut } from './history';
import { drives as Drives } from '../api';
import { hardNavigate } from '../utils/navigation';
import {
  ACTION_STARTUP_DATA, ACTION_UPDATE_DEVICES, ACTION_UPDATE_DEVICE_NETWORK, ACTION_UPDATE_DEVICE_ONLINE, ACTION_UPDATE_DEVICE_RPC, ACTION_UPDATE_ROUTE,
} from './types';
import { seek } from '../timeline/playback';
import { selectTimeFilter } from '.';

vi.mock('../api', () => ({
  account: {},
  auth: {},
  billing: {},
  devices: { fetchDevice: vi.fn(() => new Promise(() => {})), fetchDeviceStats: vi.fn() },
  drives: { getRoutesSegments: vi.fn() },
  raw: {},
  video: {},
}));
vi.mock('../utils/navigation', () => ({ hardNavigate: vi.fn() }));
const auth = vi.hoisted(() => ({ signedIn: true }));
vi.mock('@commaai/my-comma-auth', () => ({ default: { isAuthenticated: () => auth.signedIn, logOut: vi.fn() } }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn(), reconnect: vi.fn() } }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const LATER_LOG = '2026-08-06--13-00-00';
const START = Date.UTC(2026, 7, 6, 12);
const route = {
  fullname: `${DONGLE}|${LOG}`, url: 'https://routes.example.com',
  start_time_utc_millis: START, end_time_utc_millis: START + 60000,
  segment_numbers: [0], segment_start_times: [START], segment_end_times: [START + 60000],
};
const range = (start, end) => ({ start: start * 1000, end: end * 1000 });

function open(url) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const store = createAppStore(history, createInitialState());
  render(<Provider store={store}><ConnectedRouter history={history}><div /></ConnectedRouter></Provider>);
  return {
    history,
    store,
    state: () => store.getState(),
    url: () => history.location.pathname + history.location.search,
    dispatch: (action) => act(() => { store.dispatch(action); }),
    go: (n) => act(() => { history.go(n); }),
  };
}

const settle = () => act(async () => { await Promise.resolve(); });

beforeAll(() => {
  vi.stubGlobal('gtag', vi.fn());
});

// lookups stay pending until a test answers them, and are emptied after each test
let pending = [];
beforeEach(() => {
  Drives.getRoutesSegments.mockImplementation(() => new Promise((resolve) => { pending.push(resolve); }));
});
afterEach(async () => {
  auth.signedIn = true;
  await act(async () => {
    pending.forEach((resolve) => resolve([]));
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
  pending = [];
  hardNavigate.mockClear();
});

it('other query values stay on the same page, but not on another device', () => {
  const app = open(`/${DONGLE}/prime?stripe_success=cs_1`);
  app.dispatch(navigateTo({ page: 'prime' }));
  expect(app.url()).toBe(`/${DONGLE}/prime?stripe_success=cs_1`);
  app.dispatch(navigateTo({ page: 'prime', dongleId: OTHER }, { replace: true }));
  expect(app.url()).toBe(`/${OTHER}/prime`);
});

it('a copied segment url becomes its drive url', async () => {
  const app = open(`/${DONGLE}/${LOG}/3`);
  await settle();
  expect(app.url()).toBe(`/${DONGLE}/${LOG}`);
  expect(app.history.length).toBe(1);
});

it('a legacy link becomes its drive, keeping the query, without a back trap', async () => {
  Drives.getRoutesSegments.mockResolvedValue([route]);
  const app = open(`/${DONGLE}`);
  app.dispatch(push(`/${DONGLE}/1690000000000/1690000060000?settings=${OTHER}&ci=1`));
  await vi.waitFor(() => expect(app.url()).toBe(`/${DONGLE}/${LOG}?settings=${OTHER}&ci=1`));
  expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1690000000000, 1690000060000);
  expect(app.state().zoom).toEqual({ start: 0, end: 60000 });
  app.go(-1);
  await settle();
  expect(app.url()).toBe(`/${DONGLE}`);
});

it('a late legacy lookup stays on the page we moved to', async () => {
  const app = open(`/${DONGLE}/1000/2000`);
  await settle();
  app.dispatch(navigateTo({ page: 'prime' }));
  await act(async () => { pending[0]([route]); });
  await settle();
  expect(app.url()).toBe(`/${DONGLE}/prime`);
});

it('only the page on screen asks to sign in', async () => {
  auth.signedIn = false;
  const app = open(`/${DONGLE}/${LOG}`);
  app.dispatch(navigateTo({ page: 'drive', logId: LATER_LOG }));
  const [left, current] = pending;
  await act(async () => { left([]); });
  expect(hardNavigate).not.toHaveBeenCalled();
  await act(async () => { current([]); });
  expect(hardNavigate).toHaveBeenCalledExactlyOnceWith(`/?r=${encodeURIComponent(`/${DONGLE}/${LATER_LOG}`)}`);
});

it('a missing drive stays missing after an older list', async () => {
  const app = open(`/${DONGLE}`);
  app.dispatch(navigateTo({ page: 'drive', logId: LOG }));
  const [list, drive] = pending;
  await act(async () => { drive([]); });
  await act(async () => { list([route]); });
  expect(app.state().currentRoute).toBeNull();
});

it('a stale list starts nothing for the page we moved to', async () => {
  const app = open(`/${DONGLE}`);
  app.dispatch(navigateTo({ page: 'drive', logId: LOG }));
  app.dispatch(selectTimeFilter(START - 1000, START + 1000));
  app.dispatch(navigateTo({ page: 'referrals' }));
  Drives.getRoutesSegments.mockClear();
  await act(async () => { pending.forEach((answer) => answer([route])); });
  expect(Drives.getRoutesSegments).not.toHaveBeenCalled();
});

it('a used pairing token leaves the url', async () => {
  const app = open('/?pair=token');
  app.dispatch({ type: ACTION_STARTUP_DATA, devices: [{ dongle_id: DONGLE }], profile: {}, dongleId: DONGLE });
  await settle();
  expect(app.url()).toBe(`/${DONGLE}`);
});

it('a drive stays shown while its list reloads', async () => {
  const app = open(`/${DONGLE}/${LOG}`);
  await act(async () => { pending[0]([route]); });
  app.dispatch(selectTimeFilter(START - 1000, START + 1000));
  expect(app.state().currentRoute?.fullname).toBe(route.fullname);
});

it('a list that arrives while a drive is open is kept', async () => {
  Drives.getRoutesSegments.mockClear();
  const app = open(`/${DONGLE}`);
  app.dispatch(navigateTo({ page: 'drive', logId: LOG }));
  await act(async () => { pending[0]([route]); });
  app.go(-1);
  expect(app.state().routes).toHaveLength(1);
  expect(Drives.getRoutesSegments).toHaveBeenCalledTimes(2);
});

it('the newest filter wins over an older answer', async () => {
  const app = open(`/${DONGLE}`);
  app.dispatch(selectTimeFilter(START - 1000, START + 1000));
  const [older, newer] = pending;
  await act(async () => { newer([route]); });
  await act(async () => { older([]); });
  expect(app.state().routes).toHaveLength(1);
});

it('a drive\'s own response wins over the list', async () => {
  const app = open(`/${DONGLE}`);
  app.dispatch(navigateTo({ page: 'drive', logId: LOG }));
  const [list, drive] = pending;
  await act(async () => { list([route]); });
  await act(async () => { drive([{ ...route, end_time_utc_millis: START + 120000, segment_end_times: [START + 120000] }]); });
  expect(app.state().currentRoute.duration).toBe(120000);
});

it('late status for another device does not crash', () => {
  const app = open(`/${DONGLE}`);
  app.dispatch({ type: ACTION_STARTUP_DATA, devices: [{ dongle_id: DONGLE }], profile: {}, dongleId: DONGLE });
  app.dispatch(navigateTo({ page: 'dashboard', dongleId: OTHER }));
  [ACTION_UPDATE_DEVICE_ONLINE, ACTION_UPDATE_DEVICE_NETWORK, ACTION_UPDATE_DEVICE_RPC].forEach((type) => {
    expect(() => app.store.dispatch({ type, dongleId: DONGLE, fields: {} })).not.toThrow();
  });
});

it('drive edits survive leaving the drive', async () => {
  const app = open(`/${DONGLE}/${LOG}`);
  await act(async () => { pending[0]([route]); });
  app.dispatch({ type: ACTION_UPDATE_ROUTE, fullname: route.fullname, route: { is_public: true } });
  app.dispatch(navigateTo({ page: 'dashboard' }));
  await act(async () => { pending[1]([route]); }); // the list, from before the edit
  app.go(-1);
  expect(app.state().currentRoute.is_public).toBe(true);
});

it('another drive of the same length starts afresh', async () => {
  Drives.getRoutesSegments.mockResolvedValue([route, { ...route, fullname: `${DONGLE}|${LATER_LOG}` }]);
  const app = open(`/${DONGLE}`);
  await vi.waitFor(() => expect(app.state().routes).toHaveLength(2));
  app.dispatch(navigateTo({ page: 'drive', logId: LOG }));
  app.dispatch(seek(25000));
  app.dispatch(navigateTo({ page: 'drive', logId: LATER_LOG }));
  expect(app.state().offset).toBe(0);
});

it('dialogs keep playback and the drive', async () => {
  Drives.getRoutesSegments.mockResolvedValue([route]);
  const app = open(`/${DONGLE}/${LOG}`);
  await vi.waitFor(() => expect(app.state().currentRoute).not.toBeNull());
  app.dispatch(seek(25000));
  const { currentRoute, zoom } = app.state();
  app.dispatch(showDialog('settings', DONGLE));
  app.dispatch(closeDialog('settings'));
  expect(app.state().offset).toBe(25000);
  expect(app.state().currentRoute).toBe(currentRoute);
  expect(app.state().zoom).toBe(zoom);
});

it('zoom stops at the end of the drive', async () => {
  const odd = { ...route, end_time_utc_millis: START + 60500, segment_end_times: [START + 60500] };
  Drives.getRoutesSegments.mockResolvedValue([odd]);
  const app = open(`/${DONGLE}/${LOG}`);
  await vi.waitFor(() => expect(app.state().currentRoute).not.toBeNull());
  app.dispatch(zoomIn({ start: 30000, end: 60500 }));
  expect(app.url()).toBe(`/${DONGLE}/${LOG}/30/61`);
  expect(app.state().zoom).toEqual({ start: 30000, end: 60500 });
  app.dispatch(seek(45000));
  app.go(-1);
  expect(app.state().offset).toBe(0);
  app.dispatch(navigateTo({ page: 'drive', logId: LOG, range: range(70, 80) }));
  expect(app.state().zoom).toEqual({ start: 0, end: 60500 });
});

it('zoom out retraces every zoom, across a dialog', () => {
  const app = open(`/${DONGLE}/${LOG}?ci=1`);
  app.dispatch(zoomIn(range(5, 55)));
  app.dispatch(zoomIn(range(10, 50)));
  app.dispatch(zoomIn(range(20, 40)));
  app.dispatch(showDialog('settings', DONGLE));
  app.dispatch(closeDialog('settings'));
  app.dispatch(zoomOut());
  expect(app.url()).toBe(`/${DONGLE}/${LOG}/10/50?ci=1`);
  app.dispatch(zoomOut());
  expect(app.url()).toBe(`/${DONGLE}/${LOG}/5/55?ci=1`);
  app.dispatch(zoomOut());
  expect(app.url()).toBe(`/${DONGLE}/${LOG}?ci=1`);
  app.dispatch(navigateTo({ page: 'dashboard' }));
  expect(app.url()).toBe(`/${DONGLE}`);
});

it('back returns to another device\'s prime page', () => {
  const app = open(`/${DONGLE}/prime`);
  app.dispatch(navigateTo({ page: 'dashboard', dongleId: OTHER }));
  app.dispatch(navigateTo({ page: 'prime' }));
  app.go(-2);
  expect(app.url()).toBe(`/${DONGLE}/prime`);
  expect(app.state()).toMatchObject({ dongleId: DONGLE, nav: { page: 'prime' } });
});

it('stacked dialogs leave nothing to back into, and forward can reopen them', () => {
  const app = open(`/${DONGLE}`);
  app.dispatch(navigateTo({ page: 'prime' }));
  app.dispatch(showDialog('settings', DONGLE));
  app.dispatch(showDialog('settings', DONGLE));
  app.dispatch(showDialog('uploads', DONGLE));
  expect(app.history.length).toBe(4);
  app.dispatch(closeDialog('uploads'));
  app.dispatch(closeDialog('settings'));
  expect(app.url()).toBe(`/${DONGLE}/prime`);
  app.go(1);
  expect(app.state().nav.settings).toBe(DONGLE);
  app.dispatch(closeDialog('settings'));
  expect(app.url()).toBe(`/${DONGLE}/prime`);
  app.go(-1);
  expect(app.url()).toBe(`/${DONGLE}`);
});

it('the first paired device becomes the one shown', async () => {
  const app = open('/');
  app.dispatch({ type: ACTION_STARTUP_DATA, devices: [], profile: {}, dongleId: null });
  app.dispatch({ type: ACTION_UPDATE_DEVICES, devices: [{ dongle_id: DONGLE }] });
  await settle();
  expect(app.url()).toBe(`/${DONGLE}`);
});

it('a double tap on close goes back once', () => {
  const app = open(`/${DONGLE}`);
  app.dispatch(navigateTo({ page: 'prime' }));
  app.dispatch(showDialog('settings', DONGLE));
  // a browser goes back asynchronously; this back never lands
  const goBack = vi.spyOn(app.history, 'goBack').mockImplementation(() => {});
  act(() => {
    app.store.dispatch(closeDialog('settings'));
    app.store.dispatch(closeDialog('settings'));
  });
  expect(goBack).toHaveBeenCalledTimes(1);
});
