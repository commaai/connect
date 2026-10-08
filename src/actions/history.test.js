/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { LOCATION_CHANGE, push, replace } from 'connected-react-router';

import { drives as Drives } from '../api';
import { navigate, onHistoryMiddleware, showSettings } from './history';
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
  selectDevice: vi.fn(), selectRoute: vi.fn(), checkRoutesData: vi.fn(), checkLastRoutesData: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = { dongleId: DONGLE, selectedRouteId: null, router: { location: { pathname: `/${DONGLE}`, search: '' } } };

function create(state = baseState) {
  const store = { getState: vi.fn(() => state), dispatch: vi.fn() };
  store.dispatch.mockImplementation((action) => (typeof action === 'function' ? action(store.dispatch, store.getState) : action));
  const next = vi.fn();
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { store, next, invoke };
}

function location(pathname, search = '') {
  return { type: LOCATION_CHANGE, payload: { action: 'PUSH', location: { pathname, search } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['selectDevice', 'selectRoute', 'checkRoutesData', 'checkLastRoutesData']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through other actions', () => {
    const { store, next, invoke } = create();
    invoke({ type: 'TEST' });
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('selects a changed device and loads its drives', () => {
    const { next, invoke } = create();
    const action = location(`/${OTHER}`);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER);
    expect(actions.selectRoute).toHaveBeenCalledWith(null, null);
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
  });

  it('opens a drive on another device before loading it', () => {
    const { store, invoke } = create();
    invoke(location(`/${OTHER}/${LOG}/10/20`));
    expect(store.dispatch.mock.calls.map(([action]) => action.action).filter(Boolean))
      .toEqual(['selectDevice', 'selectRoute', 'checkLastRoutesData']);
    expect(actions.selectRoute).toHaveBeenCalledWith(LOG, { start: 10000, end: 20000 });
  });

  it('loads a drive opened on the same device', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}`));
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.selectRoute).toHaveBeenCalledWith(LOG, null);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it.each([
    ['a zoom', `/${DONGLE}/${LOG}/10/20`, ''],
    ['a dialog', `/${DONGLE}/${LOG}`, `?settings=${DONGLE}`],
  ])('keeps loaded data when only %s changes', (_name, pathname, search) => {
    const { invoke } = create({ ...baseState, selectedRouteId: LOG });
    invoke(location(pathname, search));
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.checkRoutesData).not.toHaveBeenCalled();
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
  });

  it('redirects home to the selected device', () => {
    const { store, invoke } = create();
    invoke(location('/'));
    expect(store.dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}`));
    expect(actions.selectRoute).not.toHaveBeenCalled();
  });

  it('waits on home until a device is selected', () => {
    const { store, invoke } = create({ ...baseState, dongleId: null });
    invoke(location('/'));
    expect(store.dispatch).toHaveBeenCalledOnce();
  });

  it('replaces a legacy timestamp range with its drive', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`)));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it.each([null, []])('keeps a legacy range for an empty lookup (%j)', async (routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: replace('/').type }));
  });

  it('keeps a legacy range when the lookup rejects', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: replace('/').type }));
    consoleError.mockRestore();
  });
});

describe('navigation', () => {
  it('pushes a new URL', () => {
    const { store } = create();
    store.dispatch(navigate(`/${DONGLE}/prime`));
    expect(store.dispatch).toHaveBeenCalledWith(push(`/${DONGLE}/prime`));
  });

  it('does not push the current URL again', () => {
    const { store } = create();
    store.dispatch(navigate(`/${DONGLE}`));
    expect(store.dispatch).toHaveBeenCalledOnce();
  });

  it('opens settings over the current page', () => {
    const { store } = create();
    store.dispatch(showSettings(OTHER));
    expect(store.dispatch).toHaveBeenCalledWith(push(`/${DONGLE}?settings=${OTHER}`));
  });
});
