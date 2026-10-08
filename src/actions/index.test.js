import { vi } from 'vitest';
import { resetPlayback, seek, selectLoop } from '../timeline/playback';
import { push } from 'connected-react-router';
import { isValidTimelineRange, popTimelineRange, primeNav, pushTimelineRange, streamNav, urlForState } from './index';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  selectLoop: vi.fn(),
  seek: vi.fn(),
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

  it('rejects zero-second zoom selections produced by short pointer drags', () => {
    expect(isValidTimelineRange(625100, 625800)).toBe(false);
    expect(isValidTimelineRange(625999, 626001)).toBe(false);
    expect(isValidTimelineRange(625000, 627000)).toBe(true);

    const dispatch = vi.fn();
    const getState = vi.fn();
    pushTimelineRange('log_id', 625100, 625800)(dispatch, getState);
    expect(dispatch).not.toHaveBeenCalled();
    expect(getState).not.toHaveBeenCalled();
  });

  const routeState = (overrides = {}) => ({
    dongleId: 'statedongle',
    selectedRouteId: 'log_id',
    currentRoute: { log_id: 'log_id' },
    routes: [{ log_id: 'log_id', duration: 60000 }],
    zoom: { start: 0, end: 60000 },
    loop: { startTime: 0, duration: 60000 },
    offset: 15000,
    desiredPlaySpeed: 0,
    seekRevision: 3,
    ...overrides,
  });

  it.each([['paused', 0], ['at 4x', 4]])('preserves %s playback on a same-drive range selection', (_name, speed) => {
    vi.clearAllMocks();
    const dispatch = vi.fn();
    const state = routeState({ desiredPlaySpeed: speed });
    pushTimelineRange('log_id', 10000, 30000, false)(dispatch, () => state);
    expect(resetPlayback).not.toHaveBeenCalled();
    expect(selectLoop).toHaveBeenCalledWith(10000, 30000);
    expect(seek).not.toHaveBeenCalled();
  });

  it('seeks to a new section only when the current playhead is outside it', () => {
    vi.clearAllMocks();
    const dispatch = vi.fn();
    const state = routeState({ offset: 40000, desiredPlaySpeed: 0 });
    pushTimelineRange('log_id', 10000, 30000, false)(dispatch, () => state);
    expect(resetPlayback).not.toHaveBeenCalled();
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(10000);
  });

  it('preserves pause and speed when returning to the previous selection', () => {
    vi.clearAllMocks();
    const dispatch = vi.fn();
    const state = routeState({
      loop: { startTime: 10000, duration: 20000 },
      zoom: { start: 10000, end: 30000, previous: { start: 0, end: 60000 } },
    });
    popTimelineRange('log_id', false)(dispatch, () => state);
    expect(resetPlayback).not.toHaveBeenCalled();
    expect(selectLoop).toHaveBeenCalledWith(0, 60000);
    expect(seek).not.toHaveBeenCalled();
  });

  it('still resets when changing drives, even if the loop bounds match', () => {
    vi.clearAllMocks();
    const dispatch = vi.fn();
    const state = routeState({
      selectedRouteId: 'old_log',
      currentRoute: { log_id: 'old_log' },
      loop: { startTime: 10000, duration: 20000 },
    });
    pushTimelineRange('log_id', 10000, 30000, false)(dispatch, () => state);
    expect(resetPlayback).toHaveBeenCalledTimes(1);
    expect(selectLoop).toHaveBeenCalledWith(10000, 30000);
    expect(seek).not.toHaveBeenCalled();
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
