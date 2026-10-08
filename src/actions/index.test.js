import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, streamNav, urlForState } from './index';
import { selectLoop } from '../timeline/playback';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
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
  beforeEach(() => vi.clearAllMocks());
  it.each([
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['zero-start drive range', ['dongle', 'log', 0, 20, false], '/dongle/log/0/20'],
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
    expect(push).toBeCalledWith('/statedongle/log_id/0/1');
  });

  it('does not reset an already selected whole drive beginning at zero', () => {
    const route = { log_id: 'log', duration: 60000 };
    const state = {
      dongleId: 'dongle', currentRoute: route, routes: [route], selectedRouteId: 'log',
      zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 },
    };
    pushTimelineRange('log', 0, 60000, false)(vi.fn(), () => state);
    expect(selectLoop).not.toHaveBeenCalled();
  });

  it('issues one interval-selection command when the selected range changes', () => {
    const route = { log_id: 'log', duration: 60000 };
    const state = {
      dongleId: 'dongle', currentRoute: route, routes: [route], selectedRouteId: 'log',
      zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 },
    };
    pushTimelineRange('log', 10000, 20000, false)(vi.fn(), () => state);
    expect(selectLoop).toHaveBeenCalledWith(10000, 20000);
    expect(selectLoop).toHaveBeenCalledOnce();
  });

  it('preserves the interval when reopening a whole drive with a late camera start', () => {
    const route = { log_id: 'log', duration: 60000, videoStartOffset: 800 };
    const state = {
      dongleId: 'dongle', currentRoute: route, routes: [route], selectedRouteId: 'log',
      zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 },
    };
    const dispatch = vi.fn();
    pushTimelineRange('log', null, null, false)(dispatch, () => state);
    expect(dispatch).not.toHaveBeenCalled();
    expect(selectLoop).not.toHaveBeenCalled();
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
