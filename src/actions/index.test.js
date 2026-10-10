import { vi } from 'vitest';
import { push } from 'connected-react-router';
import * as Types from './types';
import { loadTimelineRange, popTimelineRange, primeNav, pushTimelineRange, selectDevice, streamNav } from './index';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(() => ({ type: 'reset' })),
  selectLoop: vi.fn(() => ({ type: 'loop' })),
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn(),
  };
});

const WHOLE = { start: 0, end: 60000 };

function run(thunk, state) {
  const getState = () => ({
    dongleId: 'dongle', routes: [{ log_id: 'log', duration: 60000 }], router: { location: { pathname: '/dongle' } }, ...state,
  });
  const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, getState) : action));
  thunk(dispatch, getState);
  return dispatch.mock.calls.map(([action]) => action).filter((action) => typeof action !== 'function');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('navigation actions', () => {
  it.each([
    ['a device', selectDevice('other'), '/other'],
    ['a whole drive', pushTimelineRange('log', 0, 60000), '/dongle/log'],
    ['a drive range', pushTimelineRange('log', 10000, 20000), '/dongle/log/10/20'],
    ['a drive range from its start', pushTimelineRange('log', 0, 20000), '/dongle/log/0/20'],
    ['the previous range', popTimelineRange('log'), '/dongle/log/10/20'],
    ['Prime', primeNav(true), '/dongle/prime'],
    ['stream', streamNav(true), '/dongle/stream'],
  ])('push the URL of %s', (_name, thunk, expected) => {
    run(thunk, { zoom: { start: 15000, end: 18000, previous: { start: 10000, end: 20000 } } });
    expect(push).toHaveBeenCalledWith(expected);
  });

  it.each([
    ['closing a drive', pushTimelineRange(null, null, null)],
    ['closing Prime', primeNav(false)],
  ])('push the device URL when %s', (_name, thunk) => {
    run(thunk, { router: { location: { pathname: '/dongle/somewhere' } } });
    expect(push).toHaveBeenCalledWith('/dongle');
  });

  it('do not push the current URL again', () => {
    run(selectDevice('dongle'));
    expect(push).not.toHaveBeenCalled();
  });
});

describe('loadTimelineRange', () => {
  it('selects a drive range and loops over it', () => {
    expect(run(loadTimelineRange('log', 10000, 20000), { selectedRouteId: null, zoom: null })).toEqual([
      { type: Types.TIMELINE_PUSH_SELECTION, log_id: 'log', start: 10000, end: 20000 },
      { type: 'reset' },
      { type: 'loop' },
    ]);
  });

  it('selects a whole drive by its duration', () => {
    expect(run(loadTimelineRange('log'), { selectedRouteId: null, zoom: null })[0]).toEqual(
      { type: Types.TIMELINE_PUSH_SELECTION, log_id: 'log', ...WHOLE },
    );
  });

  it('keeps the range that is already selected', () => {
    expect(run(loadTimelineRange('log'), { selectedRouteId: 'log', zoom: WHOLE })).toEqual([]);
  });

  it('pops the zoom stack when going back to the previous range', () => {
    const zoom = { start: 10000, end: 20000, previous: WHOLE };
    expect(run(loadTimelineRange('log'), { selectedRouteId: 'log', zoom })[0]).toEqual({ type: Types.TIMELINE_POP_SELECTION });
  });
});
