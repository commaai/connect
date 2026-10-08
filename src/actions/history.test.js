import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import { api } from '../api/backend';
import { onHistoryMiddleware } from './history';
import * as actions from './index';

vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('./index', () => ({
  checkLastRoutesData: vi.fn(), navigate: vi.fn(), selectDevice: vi.fn(), setTimelineRange: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const ACTIONS = ['checkLastRoutesData', 'navigate', 'selectDevice', 'setTimelineRange'];

function create(fields = {}, pathname = `/${DONGLE}`) {
  const state = { dongleId: DONGLE, selectedRouteId: null, router: { location: { pathname } }, ...fields };
  const store = { getState: () => state, dispatch: vi.fn() };
  // run thunks like redux-thunk, record everything else
  store.dispatch.mockImplementation((action) => (typeof action === 'function' ? action(store.dispatch, store.getState) : action));
  const next = vi.fn();
  return { state, store, next, invoke: (action) => onHistoryMiddleware(store)(next)(action) };
}

function locationChange(url, action = 'POP') {
  const [pathname, search = ''] = url.split('?');
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname, search: search && `?${search}` } } };
}
const dispatched = (store) => store.dispatch.mock.calls.map(([action]) => action).filter((action) => typeof action !== 'function');

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ACTIONS) {
    actions[name].mockImplementation((...args) => ({ type: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes other actions through untouched', () => {
    const { store, next, invoke } = create();
    invoke({ type: 'TEST' });
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('records a %s before applying it', (historyAction) => {
    const { store, next, invoke } = create();
    const action = locationChange(`/${OTHER}`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(next.mock.invocationCallOrder[0]).toBeLessThan(store.dispatch.mock.invocationCallOrder[0]);
  });

  it('selects a new device, then fetches its drives', () => {
    const { store, invoke } = create();
    invoke(locationChange(`/${OTHER}`));
    expect(dispatched(store)).toEqual([
      { type: 'selectDevice', args: [OTHER] },
      { type: 'checkLastRoutesData', args: [] },
    ]);
  });

  it('sets the drive before fetching, so a new device fetches that drive', () => {
    const { store, invoke } = create();
    invoke(locationChange(`/${OTHER}/${LOG}/10/20`));
    expect(dispatched(store)).toEqual([
      { type: 'selectDevice', args: [OTHER] },
      { type: 'setTimelineRange', args: [LOG, { start: 10000, end: 20000 }] },
      { type: 'checkLastRoutesData', args: [] },
    ]);
  });

  it.each([
    ['the same dashboard', `/${DONGLE}`],
    ['a page without a device', '/referrals'],
    ['the root', '/'],
    ['Prime', `/${DONGLE}/prime`],
    ['stream', `/${DONGLE}/stream`],
    ['a settings modal', `/${DONGLE}?settings=${OTHER}`],
  ])('reuses all state for %s', (_name, pathname) => {
    const { store, invoke } = create();
    invoke(locationChange(pathname));
    expect(dispatched(store)).toEqual([]);
  });

  it('enters a drive range on the current device', () => {
    const { store, invoke } = create();
    invoke(locationChange(`/${DONGLE}/${LOG}/10/20`));
    expect(dispatched(store)).toEqual([{ type: 'setTimelineRange', args: [LOG, { start: 10000, end: 20000 }] }]);
  });

  it('shows the whole drive', () => {
    const { store, invoke } = create({ selectedRouteId: LOG });
    invoke(locationChange(`/${DONGLE}/${LOG}`));
    expect(dispatched(store)).toEqual([{ type: 'setTimelineRange', args: [LOG, null] }]);
  });

  it.each([`/${DONGLE}`, `/${DONGLE}/prime`])('leaves a drive for %s', (pathname) => {
    const { store, invoke } = create({ selectedRouteId: LOG });
    invoke(locationChange(pathname));
    expect(dispatched(store)).toEqual([{ type: 'setTimelineRange', args: [null, null] }]);
  });

  describe('legacy timestamp ranges', () => {
    const legacy = `/${DONGLE}/1000/2000`;

    it('replaces the URL with the drive found at that time', async () => {
      api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
      const { store, invoke } = create({}, legacy);
      invoke(locationChange(legacy));
      await vi.waitFor(() => expect(actions.navigate).toHaveBeenCalledWith(
        { view: 'drive', dongleId: DONGLE, logId: LOG },
        { replace: true },
      ));
      expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
      expect(actions.setTimelineRange).not.toHaveBeenCalled();
      expect(dispatched(store)).toContainEqual({ type: 'navigate', args: expect.any(Array) });
    });

    it.each([null, []])('keeps the URL for an empty lookup (%j)', async (drives) => {
      api.routes.getRoutesSegments.mockResolvedValue(drives);
      const { invoke } = create({}, legacy);
      invoke(locationChange(legacy));
      await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
      await Promise.resolve();
      expect(actions.navigate).not.toHaveBeenCalled();
    });

    it('keeps the URL when the lookup fails', async () => {
      const error = new Error('lookup failed');
      api.routes.getRoutesSegments.mockRejectedValue(error);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { invoke } = create({}, legacy);
      invoke(locationChange(legacy));
      await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
      expect(actions.navigate).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('does not redirect a user who already navigated away', async () => {
      let resolve;
      api.routes.getRoutesSegments.mockReturnValue(new Promise((r) => { resolve = r; }));
      const { state, invoke } = create({}, legacy);
      invoke(locationChange(legacy));
      state.router.location = { pathname: `/${DONGLE}/prime` };
      resolve([{ fullname: `${DONGLE}|${LOG}` }]);
      await new Promise((r) => setTimeout(r, 0));
      expect(actions.navigate).not.toHaveBeenCalled();
    });
  });
});
