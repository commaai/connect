import { vi } from 'vitest';
import { LOCATION_CHANGE, push, replace } from 'connected-react-router';

import { drives as Drives } from '../api';
import { navigate, onHistoryMiddleware } from './history';
import * as actions from './index';

vi.mock('../api', () => ({
  account: {},
  auth: {},
  billing: {},
  devices: { fetchDeviceStats: vi.fn() },
  drives: { getRoutesSegments: vi.fn() },
  raw: {},
  video: {},
}));
vi.mock('./index', () => ({
  selectDevice: vi.fn(), pushTimelineRange: vi.fn(), checkLastRoutesData: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

function locationOf(path) {
  const [pathname, search = ''] = path.split('?');
  return { pathname, search: search ? `?${search}` : '' };
}

function create(state = {}, path = `/${DONGLE}`) {
  const store = {
    state: { dongleId: DONGLE, zoom: null, selectedRouteId: null, currentRoute: null, router: { location: locationOf(path) }, ...state },
    dispatched: [],
  };
  store.getState = () => store.state;
  store.dispatch = (action) => {
    if (typeof action === 'function') return action(store.dispatch, store.getState);
    store.dispatched.push(action);
    return action;
  };
  const next = vi.fn();
  const visit = (pathname, historyAction = 'POP') => {
    const location = locationOf(pathname);
    store.state = { ...store.state, router: { location } };
    return onHistoryMiddleware(store)(next)({ type: LOCATION_CHANGE, payload: { action: historyAction, location } });
  };
  return { store, next, visit };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['selectDevice', 'pushTimelineRange', 'checkLastRoutesData']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { store, next } = create();
    onHistoryMiddleware(store)(next)();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through other actions without applying a page', () => {
    const { store, next } = create();
    onHistoryMiddleware(store)(next)({ type: 'TEST' });
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(store.dispatched).toEqual([]);
  });

  it.each([['PUSH', true], ['POP', false], ['REPLACE', false]])('selects a changed device for %s, then the drive, then routes', (historyAction, stack) => {
    const { store, next, visit } = create();
    visit(`/${OTHER}`, historyAction);
    expect(next).toHaveBeenCalledOnce();
    expect(store.dispatched).toEqual([
      { action: 'selectDevice', args: [OTHER] },
      { action: 'pushTimelineRange', args: [null, null, null, stack] },
      { action: 'checkLastRoutesData', args: [] },
    ]);
  });

  it.each([
    ['the device', `/${DONGLE}`, {}],
    ['the device with settings open', `/${DONGLE}?settings`, {}],
    ['a whole drive', `/${DONGLE}/${LOG}`, { selectedRouteId: LOG, zoom: { start: 0, end: 60000 }, currentRoute: { duration: 60000 } }],
    ['a drive range', `/${DONGLE}/${LOG}/10/20`, { selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } }],
  ])('does nothing when %s already matches state', (_name, pathname, state) => {
    const { store, visit } = create(state);
    visit(pathname, 'REPLACE');
    expect(store.dispatched).toEqual([]);
  });

  it.each([['PUSH', true], ['POP', false]])('enters a log range on %s', (historyAction, stack) => {
    const { store, visit } = create();
    visit(`/${DONGLE}/${LOG}/10/20`, historyAction);
    expect(store.dispatched).toEqual([{ action: 'pushTimelineRange', args: [LOG, 10000, 20000, stack] }]);
  });

  it('keeps a range that starts at second 0', () => {
    const { store, visit } = create();
    visit(`/${DONGLE}/${LOG}/0/20`);
    expect(store.dispatched).toEqual([{ action: 'pushTimelineRange', args: [LOG, 0, 20000, false] }]);
  });

  it.each([`/${DONGLE}`, `/${DONGLE}/prime`, `/${DONGLE}/stream`])('leaves a log range for %s', (pathname) => {
    const { store, visit } = create({ selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
    visit(pathname);
    expect(store.dispatched).toEqual([{ action: 'pushTimelineRange', args: [null, null, null, false] }]);
  });

  it('replaces a legacy timestamp range with its drive', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { store, visit } = create();
    visit(`/${DONGLE}/1000/2000`, 'PUSH');
    await vi.waitFor(() => expect(store.dispatched).toEqual([replace(`/${DONGLE}/${LOG}`)]));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it.each([null, []])('keeps a legacy range unchanged for an empty lookup (%j)', async (routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const { store, visit } = create();
    visit(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    await Promise.resolve();
    expect(store.dispatched).toEqual([]);
  });

  it('keeps a legacy range unchanged when lookup rejects', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, visit } = create();
    visit(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(store.dispatched).toEqual([]);
    consoleError.mockRestore();
  });

  it('ignores a legacy lookup that finishes after the user left', async () => {
    let resolve;
    Drives.getRoutesSegments.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { store, visit } = create();
    visit(`/${DONGLE}/1000/2000`);
    visit(`/${DONGLE}/prime`, 'PUSH');
    resolve([{ fullname: `${DONGLE}|${LOG}` }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(store.dispatched).toEqual([]);
  });
});

describe('navigate', () => {
  it.each([
    ['opens a drive', `/${DONGLE}`, { kind: 'drive', logId: LOG }, push(`/${DONGLE}/${LOG}`)],
    ['opens another device', `/${DONGLE}/${LOG}/10/20?settings`, { kind: 'device', dongleId: OTHER }, push(`/${OTHER}`)],
    ['closes settings on a kind change', `/${DONGLE}?settings`, { kind: 'prime' }, push(`/${DONGLE}/prime`)],
    ['drops pair on a kind change', `/${DONGLE}?pair=token`, { kind: 'stream' }, push(`/${DONGLE}/stream`)],
    ['keeps stripe keys on prime', `/${DONGLE}?stripe_success=sess_1`, { kind: 'prime' }, push(`/${DONGLE}/prime?stripe_success=sess_1`)],
    ['opens settings on the current page', `/${DONGLE}/${LOG}/10/20`, { settings: OTHER }, push(`/${DONGLE}/${LOG}/10/20?settings=${OTHER}`)],
    ['closes settings on the current page', `/${DONGLE}/${LOG}?settings`, { settings: null }, push(`/${DONGLE}/${LOG}`)],
    ['zooms out within the current drive', `/${DONGLE}/${LOG}/10/20`, { range: null }, push(`/${DONGLE}/${LOG}`)],
  ])('%s', (_name, path, change, expected) => {
    const { store } = create({}, path);
    store.dispatch(navigate(change));
    expect(store.dispatched).toEqual([expected]);
  });

  it('replaces when asked', () => {
    const { store } = create({ dongleId: null }, '/');
    store.dispatch(navigate({ kind: 'device', dongleId: DONGLE }, { replace: true }));
    expect(store.dispatched).toEqual([replace(`/${DONGLE}`)]);
  });

  it('does nothing when the path already matches', () => {
    const { store } = create({}, `/${DONGLE}?settings`);
    store.dispatch(navigate({ settings: DONGLE }));
    expect(store.dispatched).toEqual([]);
    store.dispatch(navigate({ settings: OTHER }));
    expect(store.dispatched).toEqual([push(`/${DONGLE}?settings=${OTHER}`)]);
  });
});
