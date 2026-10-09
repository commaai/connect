import { beforeEach, describe, expect, it, vi } from 'vitest';
import { push } from 'connected-react-router';
import { api } from '../api/backend';
import { navigate, navigateModal, primeNav, pushTimelineRange, streamNav, checkRoutesData } from './index';
import * as Types from './types';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  selectLoop: vi.fn(),
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return { __esModule: true, ...originalModule, push: vi.fn((url) => ({ type: 'push', url })) };
});

vi.mock('../api/backend', () => ({
  api: {
    routes: { getRoutesSegments: vi.fn() },
    auth: { isAuthenticated: () => true },
  },
}));

function invoke(action, state) {
  const getState = () => state;
  const dispatch = (next) => (typeof next === 'function' ? next(dispatch, getState) : next);
  dispatch(action);
}

describe('URL navigation actions', () => {
  beforeEach(() => push.mockClear());

  it('builds a whole-drive URL', () => {
    invoke(pushTimelineRange('2026-08-06--12-00-00', null, null), {
      dongleId: '0000aaaa0000aaaa', currentRoute: null, routes: null,
      router: { location: { pathname: '/0000aaaa0000aaaa', search: '', hash: '' } },
    });
    expect(push).toHaveBeenCalledWith('/0000aaaa0000aaaa/2026-08-06--12-00-00');
  });

  it('keeps a valid zero start and rounds range end up to the next second', () => {
    invoke(pushTimelineRange('2026-08-06--12-00-00', 0, 10001), {
      dongleId: '0000aaaa0000aaaa', currentRoute: null, routes: null,
      router: { location: { pathname: '/0000aaaa0000aaaa', search: '', hash: '' } },
    });
    expect(push).toHaveBeenCalledWith('/0000aaaa0000aaaa/2026-08-06--12-00-00/0/11');
  });

  it('preserves route state and existing query arguments when opening a modal', () => {
    invoke(navigateModal('filter'), {
      dongleId: '0000aaaa0000aaaa',
      router: { location: { pathname: '/0000aaaa0000aaaa/2026-08-06--12-00-00', search: '?tab=clips', hash: '' } },
    });
    expect(push).toHaveBeenCalledWith('/0000aaaa0000aaaa/2026-08-06--12-00-00?tab=clips&modal=filter');
  });

  it.each([
    ['Prime', primeNav, '/0000aaaa0000aaaa/prime'],
    ['stream', streamNav, '/0000aaaa0000aaaa/stream'],
  ])('navigates to %s through its URL', (_name, action, expected) => {
    invoke(action(true), { dongleId: '0000aaaa0000aaaa' });
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('does not push an unchanged URL', () => {
    invoke(navigate({ page: 'dashboard', dongleId: '0000aaaa0000aaaa' }), {
      router: { location: { pathname: '/0000aaaa0000aaaa', search: '', hash: '' } },
    });
    expect(push).not.toHaveBeenCalled();
  });
});

describe('route metadata requests', () => {
  beforeEach(() => api.routes.getRoutesSegments.mockReset());

  it.each([
    ['device', (state) => {
      state.dongleId = 'bbbbbbbbbbbbbbbb';
      state.router.location.pathname = '/bbbbbbbbbbbbbbbb';
    }],
    ['filter range', (state) => { state.filter = { start: 100, end: 200 }; }],
    ['route', (state) => { state.selectedRouteId = '2026-08-06--13-00-00'; }],
    ['limit', (state) => { state.limit = 10; }],
  ])('drops a delayed response when the %s changes', async (_name, changeState) => {
    let resolveA;
    const state = {
      dongleId: 'aaaaaaaaaaaaaaaa',
      selectedRouteId: null,
      currentRouteFetched: false,
      routes: null,
      filter: { start: null, end: null },
      limit: 5,
      router: { location: { pathname: '/aaaaaaaaaaaaaaaa', search: '', hash: '' } },
    };
    api.routes.getRoutesSegments
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockResolvedValue([]);
    const actions = [];
    const getState = () => state;
    const dispatch = (action) => {
      if (typeof action === 'function') {
        return action(dispatch, getState);
      }
      actions.push(action);
      return action;
    };

    dispatch(checkRoutesData());
    changeState(state);
    resolveA([{ segment_start_times: [1], segment_end_times: [1001], segment_numbers: [0],
      start_time_utc_millis: 1, end_time_utc_millis: 1001,
      fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00', url: 'https://files.example/route', create_time: 1 }]);

    await vi.waitFor(() => {
      const metadataActions = actions.filter((action) => action.type === Types.ACTION_ROUTES_METADATA);
      expect(metadataActions).toHaveLength(1);
      expect(metadataActions[0]).toMatchObject({
        dongleId: state.dongleId,
        start: state.filter.start,
        end: state.filter.end,
        selectedOnly: Boolean(state.selectedRouteId),
        routes: [],
      });
    });
  });
});
