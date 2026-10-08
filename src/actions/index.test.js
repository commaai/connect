import { vi } from 'vitest';
import { push, replace } from 'connected-react-router';
import { Page, pathFor } from '../url';
import { primeNav, pushTimelineRange, streamNav } from './index';

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
    replace: vi.fn(),
  };
});

describe('timeline actions', () => {
  it.each([
    ['device', { name: Page.device, dongleId: 'dongle' }, '/dongle'],
    ['whole drive', { name: Page.drive, dongleId: 'dongle', routeId: 'log' }, '/dongle/log'],
    ['drive range',
      { name: Page.drive, dongleId: 'dongle', routeId: 'log', zoom: { start: 10000, end: 20000 } },
      '/dongle/log/10/20'],
    ['zero-start drive range',
      { name: Page.drive, dongleId: 'dongle', routeId: 'log', zoom: { start: 0, end: 20000 } },
      '/dongle/log/0/20'],
    ['Prime', { name: Page.prime, dongleId: 'dongle' }, '/dongle/prime'],
  ])('generates a %s URL', (_name, view, expected) => {
    expect(pathFor(view)).toBe(expected);
  });

  it('should push history state when editing zoom', () => {
    const getState = vi.fn(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));
    const dispatch = vi.fn((thunk) => (
      typeof thunk === 'function' ? thunk(dispatch, getState) : thunk
    ));
    pushTimelineRange('log_id', 123, 1234)(dispatch, getState);
    expect(push).toBeCalledWith('/statedongle/log_id/0/1');
  });

  it('replaces history for a legacy drive', () => {
    vi.clearAllMocks();
    const getState = () => ({
      dongleId: 'statedongle',
      zoom: null,
      router: { location: { pathname: '/statedongle/1/2' } },
    });
    const dispatch = vi.fn((thunk) => (
      typeof thunk === 'function' ? thunk(dispatch, getState) : thunk
    ));
    pushTimelineRange('log_id', null, null, { replace: true })(dispatch, getState);
    expect(replace).toHaveBeenCalledWith('/statedongle/log_id');
    expect(push).not.toHaveBeenCalled();
  });

  it('does not push when already on the path', () => {
    vi.clearAllMocks();
    const getState = () => ({
      dongleId: 'statedongle',
      zoom: null,
      selectedRouteId: 'log_id',
      router: { location: { pathname: '/statedongle/log_id' } },
    });
    const dispatch = vi.fn((thunk) => (
      typeof thunk === 'function' ? thunk(dispatch, getState) : thunk
    ));
    pushTimelineRange('log_id', null, null)(dispatch, getState);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ['Prime', primeNav, 'primeNav', '/statedongle/prime'],
    ['stream', streamNav, 'streamNav', '/statedongle/stream'],
  ])('generates the %s URL while opening', (_name, action, stateKey, expected) => {
    const getState = () => ({ dongleId: 'statedongle', [stateKey]: false });
    const dispatch = vi.fn((thunk) => (
      typeof thunk === 'function' ? thunk(dispatch, getState) : thunk
    ));
    action(true)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(expected);
  });
});
