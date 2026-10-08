import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { popTimelineRange, primeNav, pushTimelineRange, streamNav, urlForState } from './index';
import { resetPlayback, selectLoop } from '../timeline/playback';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
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
    ['selecting a section', pushTimelineRange('log_id', 10000, 20000, false), [10000, 20000]],
    ['going back', popTimelineRange('log_id', false), [0, 60000]],
  ])('keeps the playhead, pause state and speed when %s within a drive', (_name, thunk, loop) => {
    resetPlayback.mockClear();
    thunk(vi.fn(), () => ({ selectedRouteId: 'log_id', loop: null, zoom: { start: 10000, end: 20000, previous: { start: 0, end: 60000 } } }));
    expect(resetPlayback).not.toHaveBeenCalled();
    expect(selectLoop).toHaveBeenLastCalledWith(...loop);
  });

  it('starts playback afresh when opening a different drive', () => {
    resetPlayback.mockClear();
    pushTimelineRange('next', 0, 60000, false)(vi.fn(), () => ({ selectedRouteId: 'log_id', loop: null, zoom: null }));
    expect(resetPlayback).toHaveBeenCalledOnce();
    expect(selectLoop).toHaveBeenLastCalledWith(0, 60000);
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
