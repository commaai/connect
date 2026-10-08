// URL in → state out, through the real store, reducers and middleware. The
// memory history is wired to the store exactly as ConnectedRouter does it:
// the initial location is dispatched once, then every history change.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import localforage from 'localforage';

import { createInitialState } from '../initialState';
import { createAppStore } from '../store';
import { hardNavigate } from '../utils/navigation';
import { webrtcConnectionManager } from '../utils/webrtc';
import { bufferVideo, seek } from '../timeline/playback';
import { currentOffset } from '../timeline';
import * as Types from '../actions/types';
import { selectSelectedRouteId, selectSelectedRouteMissing, selectSelectionOutOfRange, selectView } from './selectors';
import { checkRoutesData, updateDevices } from '../actions';
import { billing } from '../api';
import { driveBack, leavePage, toDashboard, toDriveRange, toPrime } from './navigate';

// the action ConnectedRouter dispatches for every location
const onLocationChanged = (location, action) => ({ type: LOCATION_CHANGE, payload: { location, action } });

const api = vi.hoisted(() => ({
  authenticated: true,
  backendType: null,
  getRoutesSegments: vi.fn(),
  listDevices: vi.fn(),
  getProfile: vi.fn(),
  fetchDevice: vi.fn(),
}));

vi.mock('../api/backend', () => ({
  activeBackendType: () => api.backendType,
  selectBackendType: (pathname) =>
    pathname.startsWith('/deadbeefdeadbeef') || pathname.startsWith('/demo') ? 'demo' : 'real',
  api: {
    auth: { isAuthenticated: () => api.authenticated, logOut: vi.fn() },
    account: { getProfile: api.getProfile },
    devices: { listDevices: api.listDevices, fetchDevice: api.fetchDevice },
    routes: { getRoutesSegments: api.getRoutesSegments },
  },
}));
vi.mock('../api', () => ({
  request: { configure: vi.fn() },
  athena: { configure: vi.fn() },
  billing: { configure: vi.fn(), getSubscribeInfo: vi.fn(async () => null), getSubscription: vi.fn(async () => null) },
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn(), reconnect: vi.fn() } }));
vi.mock('../utils/navigation', () => ({ hardNavigate: vi.fn() }));
vi.mock('localforage', () => {
  const items = new Map();
  return {
    default: {
      items,
      getItem: async (k) => items.get(k) ?? null,
      setItem: async (k, v) => {
        items.set(k, v);
        return v;
      },
      removeItem: async (k) => {
        items.delete(k);
      },
    },
  };
});

const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
const LOG = '2026-08-06--12-00-00';
const OTHER_LOG = '2026-08-06--13-00-00';

function route(dongleId, logId) {
  return {
    fullname: `${dongleId}|${logId}`,
    url: 'https://routes.example.com',
    create_time: 1,
    segment_start_times: [1000],
    segment_end_times: [61000],
    segment_numbers: [0],
    start_time_utc_millis: 1000,
    end_time_utc_millis: 61000,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function start(url) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const store = createAppStore(history, createInitialState());
  store.dispatch(onLocationChanged(history.location, history.action));
  history.listen((location, action) => store.dispatch(onLocationChanged(location, action)));
  await settle();
  await settle();
  return { history, store };
}

beforeEach(() => {
  api.authenticated = true;
  api.getProfile.mockResolvedValue({ id: 'user', superuser: false });
  api.listDevices.mockResolvedValue([
    { dongle_id: A, is_owner: true, prime: false },
    { dongle_id: B, is_owner: true, prime: false },
  ]);
  api.fetchDevice.mockResolvedValue({ last_athena_ping: 0 });
  api.getRoutesSegments.mockImplementation(async (dongleId, _s, _e, _l, routeStr) =>
    routeStr ? [route(dongleId, routeStr.split('|')[1])] : [route(dongleId, LOG)],
  );
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('one URL → state path', () => {
  it('newly paired devices load their owned resources', async () => {
    const { history, store } = await start(`/${A}`);
    const paired = 'cccccccccccccccc';
    store.dispatch(updateDevices([...store.getState().devices, { dongle_id: paired, is_owner: true, prime: true }]));
    billing.getSubscription.mockClear();
    history.push(`/${paired}`);
    await settle();
    await settle();
    expect(billing.getSubscription).toHaveBeenCalledWith(paired);
  });

  it('late shared-device responses cannot overwrite a listed device', async () => {
    const { store } = await start(`/${A}`);
    store.dispatch(updateDevices([{ dongle_id: A, alias: 'Current name', is_owner: true }]));
    store.dispatch({
      type: Types.ACTION_UPDATE_SHARED_DEVICE,
      dongleId: A,
      device: { dongle_id: A, alias: 'Old name', is_owner: false },
    });
    expect(store.getState().device.alias).toBe('Current name');
    expect(store.getState().device.is_owner).toBe(true);
  });

  it('commits the initial location once and loads its data once', async () => {
    const { store } = await start(`/${A}/${LOG}/10/20`);
    expect(store.getState().nav.generation).toBe(1);
    expect(selectSelectedRouteId(store.getState())).toBe(LOG);
    expect(store.getState().zoom).toEqual({ start: 10000, end: 20000 });
    expect(api.getRoutesSegments).toHaveBeenCalledTimes(1);
  });

  it('applies a plain history push (e.g. a router Link) like any navigation', async () => {
    const { history, store } = await start(`/${A}`);
    history.push(`/${B}/prime`);
    await settle();
    expect(store.getState().dongleId).toBe(B);
    expect(selectView(store.getState())).toBe('prime');
    expect(localStorage.getItem('selectedDongleId')).toBe(B);
  });

  it('keeps zoom, loop and playhead on a query-only change', async () => {
    const { history, store } = await start(`/${A}/${LOG}/10/20`);
    const { zoom, loop } = store.getState();
    const calls = api.getRoutesSegments.mock.calls.length;
    history.push(`/${A}/${LOG}/10/20?ci=1`);
    await settle();
    expect(store.getState().zoom).toBe(zoom);
    expect(store.getState().loop).toBe(loop);
    expect(api.getRoutesSegments).toHaveBeenCalledTimes(calls);
  });

  it('keeps the playhead when a new range still contains it', async () => {
    const { store } = await start(`/${A}/${LOG}/10/40`);
    store.dispatch({ type: 'ACTION_SEEK', offset: 15000 });
    store.dispatch(toDriveRange(A, LOG, 12000, 30000));
    await settle();
    expect(store.getState().zoom).toEqual({ start: 12000, end: 30000 });
    expect(store.getState().offset).toBe(15000);
  });

  it('loops exactly the selection when it widens or returns to the whole drive', async () => {
    const { store } = await start(`/${A}/${LOG}`);
    store.dispatch(toDriveRange(A, LOG, 10000, 20000));
    await settle();
    expect(store.getState().loop).toEqual({ startTime: 10000, duration: 10000 });
    store.dispatch(toDriveRange(A, LOG, 0, 40000));
    await settle();
    expect(store.getState().loop).toEqual({ startTime: 0, duration: 40000 });
    store.dispatch(driveBack());
    await settle();
    expect(store.getState().loop).toEqual({ startTime: 0, duration: 60000 });
    expect(store.getState().zoom).toEqual({ start: 0, end: 60000 });
  });

  it('plays a selection rounded past the end of the drive to the end, without rewriting the URL', async () => {
    api.getRoutesSegments.mockImplementation(async (dongleId) => [
      { ...route(dongleId, LOG), segment_end_times: [61123], end_time_utc_millis: 61123 },
    ]);
    const { history, store } = await start(`/${A}/${LOG}`);
    expect(store.getState().currentRoute.duration).toBe(60123);
    store.dispatch(toDriveRange(A, LOG, 30000, 60123));
    await settle();
    expect(history.location.pathname).toBe(`/${A}/${LOG}/30/61`);
    expect(store.getState().zoom).toEqual({ start: 30000, end: 60123 });
    expect(store.getState().loop).toEqual({ startTime: 30000, duration: 30123 });

    const cold = await start(`/${A}/${LOG}/30/61`);
    expect(cold.history.location.pathname).toBe(`/${A}/${LOG}/30/61`);
    expect(cold.store.getState().zoom).toEqual({ start: 30000, end: 60123 });
  });

  it('a selection after the end of the drive has no effective range and is flagged', async () => {
    const { history, store } = await start(`/${A}/${LOG}/70/80`);
    expect(history.location.pathname).toBe(`/${A}/${LOG}/70/80`);
    expect(store.getState().currentRoute.duration).toBe(60000);
    expect(store.getState().zoom).toBeNull();
    expect(store.getState().loop).toBeNull();
    expect(selectSelectionOutOfRange(store.getState())).toBe(true);

    store.dispatch(driveBack());
    await settle();
    expect(history.location.pathname).toBe(`/${A}/${LOG}`);
    expect(store.getState().zoom).toEqual({ start: 0, end: 60000 });
    expect(selectSelectionOutOfRange(store.getState())).toBe(false);
  });

  it('rounds a timeline selection outward once and commits exactly the URL', async () => {
    const { history, store } = await start(`/${A}/${LOG}`);
    store.dispatch(toDriveRange(A, LOG, 1234, 5678));
    await settle();
    expect(history.location.pathname).toBe(`/${A}/${LOG}/1/6`);
    expect(store.getState().zoom).toEqual({ start: 1000, end: 6000 });
  });

  it.each([
    [`/${A}/`, `/${A}`],
    ['/demo', '/deadbeefdeadbeef'],
  ])('canonicalizes %s with replace and loads once', async (url, canonical) => {
    const { history, store } = await start(url);
    expect(history.location.pathname).toBe(canonical);
    expect(history.length).toBe(1);
    expect(store.getState().dongleId).toBe(canonical.slice(1));
    expect(api.getRoutesSegments).toHaveBeenCalledTimes(1);
  });

  it('shows an invalid location without loading anything', async () => {
    const { store } = await start('/nonsense/abc/def');
    expect(selectView(store.getState())).toBe('invalid');
    expect(api.getRoutesSegments).not.toHaveBeenCalled();
  });
});

describe('history regressions', () => {
  it('Back from Prime onto a drive does not push over the drive URL', async () => {
    const { history, store } = await start(`/${A}/${LOG}`);
    store.dispatch(toPrime(A));
    await settle();
    history.goBack();
    await settle();
    expect(history.location.pathname).toBe(`/${A}/${LOG}`);
    expect(history.length).toBe(2);
    expect(selectView(store.getState())).toBe('drive');
  });

  it('a legacy range resolves with replace, so Back does not return to it', async () => {
    const { history } = await start(`/${A}/1000/61000`);
    await settle();
    expect(history.location.pathname).toBe(`/${A}/${LOG}`);
    expect(history.length).toBe(1);
  });

  it('a slow legacy lookup does not redirect after the user left', async () => {
    let resolveLookup;
    api.getRoutesSegments.mockImplementation((dongleId, s, e, limit, routeStr) => {
      if (routeStr || limit) return Promise.resolve([route(dongleId, LOG)]);
      return new Promise((resolve) => {
        resolveLookup = resolve;
      }); // the legacy lookup
    });
    const { history } = await start(`/${A}/1000/61000`);
    history.push(`/${B}`);
    await settle();
    resolveLookup([route(A, LOG)]);
    await settle();
    expect(history.location.pathname).toBe(`/${B}`);
  });

  it('a stale legacy lookup cannot redirect after A → B → A', async () => {
    const lookups = [];
    api.getRoutesSegments.mockImplementation((dongleId, s, e, l, routeStr) => {
      if (routeStr || l) return Promise.resolve([route(dongleId, LOG)]);
      return new Promise((resolve) => lookups.push(resolve));
    });
    const { history } = await start(`/${A}/1000/61000`);
    history.push(`/${B}`);
    await settle();
    history.goBack();
    await settle();
    lookups[0]([route(A, OTHER_LOG)]); // the first visit's lookup
    await settle();
    expect(history.location.pathname).toBe(`/${A}/1000/61000`);
    lookups[1]([route(A, LOG)]);
    await settle();
    expect(history.location.pathname).toBe(`/${A}/${LOG}`);
  });

  it('drive back returns to a verified wider selection, else replaces with the whole drive', async () => {
    const { history, store } = await start(`/${A}/${LOG}`);
    store.dispatch(toDriveRange(A, LOG, 10000, 20000));
    await settle();
    store.dispatch(driveBack());
    await settle();
    expect(history.location.pathname).toBe(`/${A}/${LOG}`);
    expect(history.index).toBe(0);

    const cold = await start(`/${A}/${LOG}/10/20`);
    cold.store.dispatch(driveBack());
    await settle();
    expect(cold.history.location.pathname).toBe(`/${A}/${LOG}`);
    expect(cold.history.length).toBe(1);
  });

  it('leaving a page opened in-app goes back; a cold entry pushes the dashboard', async () => {
    const { history, store } = await start(`/${A}/${LOG}`);
    store.dispatch(toPrime(A));
    await settle();
    store.dispatch(leavePage(A));
    await settle();
    expect(history.location.pathname).toBe(`/${A}/${LOG}`);

    const cold = await start(`/${A}/prime`);
    cold.store.dispatch(leavePage(A));
    await settle();
    expect(cold.history.location.pathname).toBe(`/${A}`);
    expect(cold.history.length).toBe(2);
  });
});

describe('request identity', () => {
  it('a slow response for drive A cannot select itself after switching to drive B', async () => {
    const pending = {};
    api.getRoutesSegments.mockImplementation(
      (dongleId, s, e, l, routeStr) =>
        new Promise((resolve) => {
          pending[routeStr] = () => resolve([route(dongleId, routeStr.split('|')[1])]);
        }),
    );
    const { history, store } = await start(`/${A}/${LOG}`);
    history.push(`/${A}/${OTHER_LOG}`);
    await settle();
    pending[`${A}|${LOG}`]();
    await settle();
    // drive A's routes must not be applied while drive B is selected
    expect(store.getState().routes).toBeNull();
    expect(store.getState().currentRoute).toBeNull();
    pending[`${A}|${OTHER_LOG}`]();
    await settle();
    await settle();
    expect(store.getState().currentRoute?.log_id).toBe(OTHER_LOG);
  });
});

describe('commands', () => {
  it('consumes the Stripe result, removes it from the URL and still loads the page', async () => {
    const { history, store } = await start(`/${A}/prime?stripe_success=1&ci=1`);
    await settle();
    expect(history.location.search).toBe('?ci=1');
    expect(store.getState().primeStripeResult).toEqual({ success: '1', cancelled: null });
    // the Prime page's own effects still ran (it doesn't need the drive list)
    expect(api.fetchDevice).toHaveBeenCalledWith(A);
    expect(api.getRoutesSegments).not.toHaveBeenCalled();
    expect(localStorage.getItem('selectedDongleId')).toBe(A);
  });

  it('resolves / after consuming a pair token', async () => {
    localStorage.setItem('selectedDongleId', B);
    const { history } = await start('/?pair=token');
    await settle();
    expect(`${history.location.pathname}${history.location.search}`).toBe(`/${B}`);
  });

  it('follows a safe post-login return target, and ignores an external one', async () => {
    const { history } = await start(`/?r=${encodeURIComponent(`/${A}/${LOG}?x=1`)}`);
    expect(`${history.location.pathname}${history.location.search}`).toBe(`/${A}/${LOG}?x=1`);

    api.getRoutesSegments.mockClear();
    const external = await start(`/${A}?r=${encodeURIComponent('//evil.example.com')}`);
    expect(`${external.history.location.pathname}${external.history.location.search}`).toBe(`/${A}`);
    expect(api.getRoutesSegments).toHaveBeenCalled();
  });

  it('resolves / to the remembered device with replace', async () => {
    localStorage.setItem('selectedDongleId', B);
    const { history } = await start('/');
    await settle();
    expect(history.location.pathname).toBe(`/${B}`);
    expect(history.length).toBe(1);
  });
});

// Regressions for IMPROVE_ARCH_DOCS/PR1_VERIFICATION.md (the reviewer's probes
// plus the findings they described without a probe).
describe('location edits, stale work and commands', () => {
  const url = (history) => `${history.location.pathname}${history.location.search}${history.location.hash}`;

  it('a same-drive range edit keeps unknown arguments (in order) and the hash', async () => {
    const { history, store } = await start(`/${A}/${LOG}?x=one&x=two&ci=1#bookmark`);
    store.dispatch(toDriveRange(A, LOG, 1234, 5678));
    await settle();
    expect(url(history)).toBe(`/${A}/${LOG}/1/6?x=one&x=two&ci=1#bookmark`);
  });

  it('a different page keeps only the global arguments', async () => {
    const { history, store } = await start(`/${A}/${LOG}?x=one&ci=1#bookmark`);
    store.dispatch(toDashboard(B));
    await settle();
    expect(url(history)).toBe(`/${B}?ci=1`);
  });

  it('a queued canonical rewrite cannot overwrite a later navigation', async () => {
    const { history } = await start(`/${A}`);
    history.push(`/${A}/`);
    history.push(`/${B}`);
    await settle();
    await settle();
    expect(history.location.pathname).toBe(`/${B}`);
  });

  it('a queued return command cannot redirect after a later navigation', async () => {
    const { history } = await start(`/${A}`);
    history.push(`/${A}?r=${encodeURIComponent(`/${B}`)}`); // canonical, so its effects are queued
    history.push(`/${A}/${LOG}`);
    await settle();
    await settle();
    expect(history.location.pathname).toBe(`/${A}/${LOG}`);
  });

  it('an invalid link runs none of its commands', async () => {
    const { history, store } = await start(`/${A}?r=/${B}&r=/${A}/${LOG}`);
    expect(selectView(store.getState())).toBe('invalid');
    expect(history.location.search).toBe(`?r=/${B}&r=/${A}/${LOG}`);
  });

  it('switching from a loaded drive to another drive fetches it, keeping the list', async () => {
    const { history, store } = await start(`/${A}`);
    const list = store.getState().routes;
    history.push(`/${A}/${LOG}`);
    await settle();
    expect(store.getState().currentRoute?.log_id).toBe(LOG);
    api.getRoutesSegments.mockClear();
    history.push(`/${A}/${OTHER_LOG}`);
    await settle();
    await settle();
    expect(api.getRoutesSegments).toHaveBeenCalledWith(A, undefined, undefined, undefined, `${A}|${OTHER_LOG}`);
    expect(store.getState().currentRoute?.log_id).toBe(OTHER_LOG);
    expect(store.getState().routes.map((r) => r.log_id)).toEqual([...list.map((r) => r.log_id), OTHER_LOG]);
  });

  it('a drive that does not exist is reported once, without retrying', async () => {
    api.getRoutesSegments.mockImplementation(async (dongleId, _s, _e, _l, routeStr) =>
      routeStr ? [] : [route(dongleId, LOG)],
    );
    const { history, store } = await start(`/${A}`);
    history.push(`/${A}/${OTHER_LOG}`);
    await settle();
    await settle();
    expect(selectSelectedRouteMissing(store.getState())).toBe(true);
    const calls = api.getRoutesSegments.mock.calls.length;
    store.dispatch(checkRoutesData());
    await settle();
    expect(api.getRoutesSegments).toHaveBeenCalledTimes(calls);
  });

  it('an older response for the same view cannot overwrite a newer one (A → B → A)', async () => {
    const answers = [];
    api.getRoutesSegments.mockImplementation(
      (dongleId) => new Promise((resolve) => answers.push({ dongleId, resolve })),
    );
    const { history, store } = await start(`/${A}`);
    history.push(`/${B}`);
    await settle();
    history.push(`/${A}`);
    await settle();
    const [a1, , a2] = answers;
    a2.resolve([route(A, OTHER_LOG)]);
    await settle();
    a1.resolve([route(A, LOG)]);
    await settle();
    expect(store.getState().routes.map((r) => r.log_id)).toEqual([OTHER_LOG]);
  });

  it('an old empty response cannot send a newer visit to login', async () => {
    api.authenticated = false;
    const answers = [];
    api.getRoutesSegments.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    const { history } = await start(`/${A}/${LOG}`);
    history.push(`/${B}/${LOG}`);
    await settle();
    history.push(`/${A}/${LOG}`);
    await settle();
    answers[0]([]); // the first visit's empty answer arrives while the second is pending
    await settle();
    expect(hardNavigate).not.toHaveBeenCalled();
    answers[2]([route(A, LOG)]);
    await settle();
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it('a pair token arriving by URL later in the session is stored and handed over', async () => {
    const { history, store } = await start(`/${A}`);
    history.push(`/${A}?pair=token-1`);
    await settle();
    await settle();
    expect(localforage.items.get('pairToken')).toBe('token-1');
    expect(store.getState().pairRequests).toBe(1);
    expect(history.location.search).toBe('');
  });

  it('switching to another device disconnects the stream connection', async () => {
    const { history } = await start(`/${A}/stream`);
    history.push(`/${A}`);
    await settle();
    expect(webrtcConnectionManager.disconnect).not.toHaveBeenCalled();
    history.push(`/${B}`);
    await settle();
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledTimes(1);
  });

  it('crossing between the demo and real backends reloads the page', async () => {
    api.backendType = 'real';
    try {
      const { history } = await start(`/${A}`);
      history.push('/deadbeefdeadbeef');
      await settle();
      expect(hardNavigate).toHaveBeenCalledWith('/deadbeefdeadbeef');
    } finally {
      api.backendType = null;
    }
  });

  it('root resolution keeps the global arguments and hash; legacy keeps everything', async () => {
    localStorage.setItem('selectedDongleId', B);
    const root = await start('/?ci=1#bookmark');
    expect(url(root.history)).toBe(`/${B}?ci=1#bookmark`);

    const legacy = await start(`/${A}/1000/61000?x=one&x=two&ci=1#bookmark`);
    await settle();
    expect(url(legacy.history)).toBe(`/${A}/${LOG}?x=one&x=two&ci=1#bookmark`);
  });
});

// Regressions from IMPROVE_ARCH_DOCS/BOTH_BRANCHES_VERIFICATION.md (the
// reviewer's probes; the stream one asserts the release reported to the
// connection manager, which now decides whether to disconnect).
describe('same-page navigation and request order', () => {
  it('a queued canonical rewrite preserves a newer same-page hash navigation', async () => {
    const { history } = await start(`/${A}`);
    history.push(`/${A}/`);
    history.push(`/${A}#new`);
    await settle();
    await settle();
    expect(history.location.hash).toBe('#new');
  });

  it('...and the page still loads (the deferred effects are not lost)', async () => {
    const { history, store } = await start(`/${B}`);
    api.getRoutesSegments.mockClear();
    history.push(`/${A}/`);
    history.push(`/${A}#new`);
    await settle();
    await settle();
    expect(store.getState().dongleId).toBe(A);
    expect(api.getRoutesSegments).toHaveBeenCalled();
  });

  it('a command token already consumed in this session is not consumed again after another token', async () => {
    const { history, store } = await start(`/${A}`);
    for (const token of ['token-1', 'token-2', 'token-1']) {
      history.push(`/${A}?pair=${token}`);
      // one navigation at a time, on purpose
      // eslint-disable-next-line no-await-in-loop
      await settle().then(settle);
    }
    expect(store.getState().pairRequests).toBe(2);
  });

  it('a range edit preserves elapsed playing position inside the new bounds', async () => {
    const { store } = await start(`/${A}/${LOG}`);
    const t = 1900000000000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(t);
    try {
      store.dispatch(seek(0));
      store.dispatch(bufferVideo(false));
      now.mockReturnValue(t + 15000);
      expect(currentOffset(store.getState())).toBe(15000);
      store.dispatch(toDriveRange(A, LOG, 10000, 20000));
      await settle();
      expect(currentOffset(store.getState())).toBe(15000);
    } finally {
      now.mockRestore();
    }
  });

  it('newer A request remains authoritative when older A resolves first', async () => {
    const answers = [];
    api.getRoutesSegments.mockImplementation(
      (dongleId) => new Promise((resolve) => answers.push({ dongleId, resolve })),
    );
    const { history, store } = await start(`/${A}`);
    history.push(`/${B}`);
    await settle();
    history.push(`/${A}`);
    await settle();
    answers[0].resolve([route(A, LOG)]);
    await settle();
    answers[2].resolve([route(A, OTHER_LOG)]);
    await settle();
    await settle();
    expect(store.getState().routes.map((r) => r.log_id)).toEqual([OTHER_LOG]);
  });
});
