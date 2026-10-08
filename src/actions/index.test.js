import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { popTimelineRange, primeNav, pushTimelineRange, streamNav, urlForState } from './index';
import * as Types from './types';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  seek: (offset) => ({ type: 'ACTION_SEEK', offset }),
  selectLoop: vi.fn(),
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn(),
  };
});

describe('timeline actions', () => {
  it.each([
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['zero-start drive range', ['dongle', 'log', 0, 20, false], '/dongle/log'],
    ['Prime', ['dongle', null, null, null, true], '/dongle/prime'],
  ])('generates a %s URL', (_name, args, expected) => {
    expect(urlForState(...args)).toBe(expected);
  });

  it('should push history state when editing zoom', () => {
    const dispatch = vi.fn();
    const getState = vi.fn();
    const actionThunk = pushTimelineRange("log_id", 123, 1234);

    getState.mockImplementationOnce(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith('/statedongle/log_id');
  });

  it.each([
    ['Prime', primeNav, 'primeNav', '/statedongle/prime'],
    ['stream', streamNav, 'streamNav', '/statedongle/stream'],
  ])('generates the %s URL while opening', (_name, action, stateKey, expected) => {
    const dispatch = vi.fn();
    action(true)(dispatch, () => ({ dongleId: 'statedongle', [stateKey]: false }));
    expect(push).toHaveBeenCalledWith(expected);
  });
});

describe('returning from a selected range', () => {
  const DURATION = 900000;
  const baseState = () => ({
    dongleId: 'dongle',
    selectedRouteId: 'log',
    currentRoute: { fullname: 'dongle|log', log_id: 'log', duration: DURATION },
    offset: 500000,
    desiredPlaySpeed: 0,
    isBufferingVideo: false,
    startTime: Date.now(),
    loop: null,
    router: { location: { pathname: '/dongle/log' } },
  });
  // a 2:00-3:00 range selected while watching the whole drive at 8:20
  const inRange = (returnOffset = 500000, previous = { start: 0, end: DURATION }) => ({
    ...baseState(),
    zoom: { start: 120000, end: 180000, previous, returnOffset },
    loop: { startTime: 120000, duration: 60000 },
  });
  const seeks = (dispatch) => dispatch.mock.calls.map(([a]) => a).filter((a) => a?.type === 'ACTION_SEEK');

  it('remembers the playback position when selecting a range', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log', 120000, 180000)(dispatch, () => ({ ...baseState(), zoom: { start: 0, end: DURATION } }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.TIMELINE_PUSH_SELECTION, start: 120000, end: 180000, returnOffset: 500000,
    }));
  });

  it('does not remember a position when opening a drive', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log', 0, DURATION)(dispatch, () => ({ ...baseState(), selectedRouteId: null, zoom: null }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: Types.TIMELINE_PUSH_SELECTION, returnOffset: null }));
  });

  it('returns there with the back arrow', () => {
    const dispatch = vi.fn();
    popTimelineRange('log')(dispatch, inRange);
    expect(seeks(dispatch)).toEqual([{ type: 'ACTION_SEEK', offset: 500000 }]);
  });

  it('returns there with the browser back button', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log', null, null, false)(dispatch, inRange);
    expect(seeks(dispatch)).toEqual([{ type: 'ACTION_SEEK', offset: 500000 }]);
  });

  it('does not return when moving to a different range', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log', 130000, 140000)(dispatch, inRange);
    expect(seeks(dispatch)).toEqual([]);
  });

  it('has nowhere to return for a range opened from a link', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log', null, null)(dispatch, () => inRange(null, null));
    expect(seeks(dispatch)).toEqual([]);
  });
});
