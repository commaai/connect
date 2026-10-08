import { vi } from 'vitest';
import { push, replace } from 'connected-react-router';
import { navigate, pushTimelineRange, setTimelineRange, showDeviceSettings } from './index';
import * as Types from './types';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(() => ({ type: 'reset' })),
  selectLoop: vi.fn((start, end) => ({ type: 'loop', start, end })),
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn((path) => ({ type: 'push', path })),
    replace: vi.fn((path) => ({ type: 'replace', path })),
  };
});

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

// Run a thunk (and the thunks it dispatches) against a fixed state; return the plain actions.
function run(thunk, fields = {}, url = `/${DONGLE}`) {
  const [pathname, search = ''] = url.split('?');
  const state = {
    dongleId: DONGLE,
    router: { location: { pathname, search: search && `?${search}` } },
    routes: [{ log_id: LOG, duration: 60000 }],
    selectedRouteId: null,
    zoom: null,
    loop: null,
    ...fields,
  };
  const actions = [];
  const dispatch = (action) => (typeof action === 'function' ? action(dispatch, () => state) : actions.push(action));
  thunk(dispatch, () => state);
  return actions;
}

beforeEach(() => vi.clearAllMocks());

describe('navigate', () => {
  it.each([
    [{ view: 'prime' }, `/${DONGLE}/prime`],
    [{ view: 'stream' }, `/${DONGLE}/stream`],
    [{ view: 'referrals' }, '/referrals'],
    [{ dongleId: OTHER }, `/${OTHER}`],
    [{ view: 'drive', logId: LOG }, `/${DONGLE}/${LOG}`],
  ])('pushes %j', (route, path) => {
    expect(run(navigate(route), {}, '/')).toEqual([{ type: 'push', path }]);
  });

  it('falls back to the root without a device', () => {
    expect(run(navigate({ view: 'dashboard' }), { dongleId: null }, '/referrals')).toEqual([{ type: 'push', path: '/' }]);
  });

  it('replaces when asked', () => {
    expect(run(navigate({ dongleId: OTHER }, { replace: true }))).toEqual([{ type: 'replace', path: `/${OTHER}` }]);
    expect(push).not.toHaveBeenCalled();
  });

  it('does nothing for the current URL', () => {
    expect(run(navigate({ view: 'dashboard' }))).toEqual([]);
    expect(run(navigate({ view: 'dashboard', settings: OTHER }), {}, `/${DONGLE}?settings=${OTHER}`)).toEqual([]);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('showDeviceSettings', () => {
  it.each([
    [`/${DONGLE}/${LOG}/10/20`, `/${DONGLE}/${LOG}/10/20?settings=${OTHER}`],
    ['/referrals', `/referrals?settings=${OTHER}`],
    ['/', `/?settings=${OTHER}`],
  ])('opens over %s', (url, path) => {
    expect(run(showDeviceSettings(OTHER), {}, url)).toEqual([{ type: 'push', path }]);
  });

  it('closes back to the same page', () => {
    expect(run(showDeviceSettings(null), {}, `/${DONGLE}/prime?settings=${OTHER}`))
      .toEqual([{ type: 'push', path: `/${DONGLE}/prime` }]);
  });
});

describe('pushTimelineRange', () => {
  it.each([
    [[LOG], `/${DONGLE}/${LOG}`],
    [[LOG, 0, 60000], `/${DONGLE}/${LOG}`],
    [[LOG, 0, 20000], `/${DONGLE}/${LOG}/0/20`],
    [[LOG, 10500, 20500], `/${DONGLE}/${LOG}/10/20`],
  ])('navigates to %j', (args, path) => {
    expect(run(pushTimelineRange(...args))).toEqual([{ type: 'push', path }]);
  });
});

describe('setTimelineRange', () => {
  it('resolves the whole drive from its duration and loops over it', () => {
    expect(run(setTimelineRange(LOG, null))).toEqual([
      { type: Types.TIMELINE_PUSH_SELECTION, log_id: LOG, start: 0, end: 60000 },
      { type: 'reset' },
      { type: 'loop', start: 0, end: 60000 },
    ]);
  });

  it('waits for the drive length when the drive is not loaded yet', () => {
    expect(run(setTimelineRange(LOG, null), { routes: null })[0])
      .toEqual({ type: Types.TIMELINE_PUSH_SELECTION, log_id: LOG, start: null, end: null });
  });

  it('keeps playback when the range is already shown and looped', () => {
    const shown = { selectedRouteId: LOG, zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 } };
    expect(run(setTimelineRange(LOG, { start: 10000, end: 20000 }), shown)).toEqual([]);
  });

  it('clears the drive', () => {
    const shown = { selectedRouteId: LOG, zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 } };
    expect(run(setTimelineRange(null, null), shown)[0])
      .toEqual({ type: Types.TIMELINE_PUSH_SELECTION, log_id: null, start: null, end: null });
  });
});
