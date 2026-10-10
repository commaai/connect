import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, streamNav, urlForState } from './index';
import { currentOffset } from '../timeline';
import { resetPlayback, seek } from '../timeline/playback';

vi.mock('../timeline', () => ({ currentOffset: vi.fn() }));

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  seek: vi.fn(),
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
    ['another drive resets playback', 'other', 30000, 1, []],
    ['the same drive keeps playing inside the new range', 'log_id', 30000, 0, []],
    ['the same drive seeks to a new range without the position', 'log_id', 5000, 0, [[10000]]],
  ])('changing the range: %s', (_name, selectedRouteId, offset, resets, seeks) => {
    currentOffset.mockReturnValue(offset);
    pushTimelineRange('log_id', 10000, 50000, false)(vi.fn(), () => ({ selectedRouteId, loop: {}, zoom: {} }));
    expect(resetPlayback).toHaveBeenCalledTimes(resets);
    expect(seek.mock.calls).toEqual(seeks);
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
