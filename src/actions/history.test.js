import { LOCATION_CHANGE, replace } from 'connected-react-router';

import '../store';

import { onHistoryMiddleware, syncLocation } from './history';
import * as Types from './types';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';

const SHARED = '2222cccc2222cccc';
const LOG = '2026-08-06--12-00-00';

const devices = [
  { dongle_id: DONGLE, is_owner: true },
  { dongle_id: OTHER, is_owner: true },
  { dongle_id: SHARED, is_owner: false },
];

function stateAt(pathname, state) {
  return {
    router: { location: { pathname, search: '?pair=token', hash: '' } },
    dongleId: DONGLE,
    devices,
    profile: { superuser: false },
    routes: null,
    selectedRouteId: null,
    currentRoute: null,
    zoom: null,
    loop: null,
    ...state,
  };
}

function sync(pathname, state, deviceOrder) {
  const getState = () => stateAt(pathname, state);
  const actions = [];
  const record = (action) => (action instanceof Function ? undefined : actions.push(action));
  const dispatch = (action) => (action instanceof Function ? action(record, getState) : actions.push(action));
  syncLocation(deviceOrder)(dispatch, getState);

  return actions;
}

const typesOf = (actions) => actions.map((a) => a.type);

beforeEach(() => {
  window.localStorage.clear();
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const next = vi.fn();
    onHistoryMiddleware({ dispatch: vi.fn() })(next)();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes other actions through', () => {
    const next = vi.fn();
    const dispatch = vi.fn();
    onHistoryMiddleware({ dispatch })(next)({ type: 'TEST' });
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('syncs after a %s location change', (historyAction) => {
    const next = vi.fn();
    const dispatch = vi.fn();
    const action = { type: LOCATION_CHANGE, payload: { action: historyAction, location: { pathname: '/' } } };
    onHistoryMiddleware({ dispatch })(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(dispatch).toHaveBeenCalledWith(expect.any(Function));
  });
});

describe('syncLocation replaces', () => {
  const replaced = (url) => [replace({ pathname: url, search: '?pair=token', hash: '' })];

  it.each([
    ['an unknown page with its dashboard', `/${DONGLE}/x`, `/${DONGLE}`],
    ['a legacy timestamp range with its dashboard', `/${DONGLE}/1786017600000/1786017660000`, `/${DONGLE}`],
    ['a trailing slash', `/${DONGLE}/`, `/${DONGLE}`],
  ])('%s', (_name, pathname, expected) => {
    expect(sync(pathname)).toEqual(replaced(expected));
  });

  it('"/" with the remembered device', () => {
    window.localStorage.setItem('selectedDongleId', OTHER);
    expect(sync('/')).toEqual(replaced(`/${OTHER}`));
  });

  it('"/" with the first device in the given order when none is remembered', () => {
    window.localStorage.setItem('selectedDongleId', 'dddddddddddddddd');
    expect(sync('/', {}, [devices[1], devices[0]])).toEqual(replaced(`/${OTHER}`));
  });

  it('nothing before the device list arrives', () => {
    expect(sync('/', { devices: null, dongleId: null })).toEqual([]);
  });
});

describe('syncLocation loads', () => {
  it('a device the url names', () => {
    expect(sync(`/${OTHER}`)).toContainEqual({ type: Types.ACTION_SELECT_DEVICE, dongleId: OTHER });
  });

  it('nothing for the device already loaded', () => {
    expect(sync(`/${DONGLE}`)).toEqual([]);
    expect(sync(`/${DONGLE}/prime`)).toEqual([]);
  });

  it('nothing on referrals: it keeps the loaded device', () => {
    expect(sync('/referrals')).toEqual([]);
  });

  it('the fallback device on referrals when none is loaded', () => {
    expect(sync('/referrals', { dongleId: null })).toContainEqual({ type: Types.ACTION_SELECT_DEVICE, dongleId: DONGLE });
  });

  it.each([
    ['a whole drive', `/${DONGLE}/${LOG}`, { log_id: LOG, start: null, end: null }],
    ['a range', `/${DONGLE}/${LOG}/10/20`, { log_id: LOG, start: 10000, end: 20000 }],
  ])('%s', (_name, pathname, selection) => {
    expect(sync(pathname)).toContainEqual({ type: Types.TIMELINE_SELECT, ...selection });
  });

  it('the drive before the device, so the device fetches the drive', () => {
    expect(typesOf(sync(`/${OTHER}/${LOG}`)).filter((t) => t === Types.TIMELINE_SELECT || t === Types.ACTION_SELECT_DEVICE))
      .toEqual([Types.TIMELINE_SELECT, Types.ACTION_SELECT_DEVICE]);
  });

  it('nothing for the range already shown', () => {
    const zoom = { start: 10000, end: 20000, previous: { start: 0, end: 60000, previous: null } };
    expect(sync(`/${DONGLE}/${LOG}/10/20`, { selectedRouteId: LOG, zoom })).toEqual([]);
  });

  it('no drive when leaving one', () => {
    const zoom = { start: 0, end: 60000, previous: null };
    expect(sync(`/${DONGLE}`, { selectedRouteId: LOG, zoom })).toContainEqual(
      { type: Types.TIMELINE_SELECT, log_id: null, start: null, end: null },
    );
  });
});
