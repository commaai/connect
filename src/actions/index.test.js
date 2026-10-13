import { vi } from 'vitest';
import { goBack, push } from 'connected-react-router';
import { navigate, popTimelineRange, primeNav, pushTimelineRange, selectDevice, streamNav } from './index';

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn((url) => ({ pushed: url })),
    goBack: vi.fn(() => ({ back: true })),
  };
});

const DONGLE = '0000aaaa0000aaaa';
const state = (extra) => ({ dongleId: 'statedongle', router: { location: { pathname: '/', search: '' } }, ...extra });
const run = (thunk, s = state()) => {
  const dispatch = vi.fn((a) => (typeof a === 'function' ? a(dispatch, () => s) : a));
  dispatch(thunk);
};

describe('navigation actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pushes the drive range URL when editing zoom', () => {
    run(pushTimelineRange('log_id', 123, 1234));
    expect(push).toHaveBeenCalledWith('/statedongle/log_id/0/2', undefined);
  });

  it('pushes the whole drive URL for a full-length range', () => {
    const routes = [{ log_id: 'log_id', duration: 1234 }];
    run(pushTimelineRange('log_id', 0, 1234), state({ routes }));
    expect(push).toHaveBeenCalledWith('/statedongle/log_id', undefined);
  });

  it('marks a zoom within the open drive so Back undoes it', () => {
    run(pushTimelineRange('log_id', 123, 1234), state({ selectedRouteId: 'log_id' }));
    expect(push).toHaveBeenCalledWith('/statedongle/log_id/0/2', { zoomOut: true });
    run(pushTimelineRange('log_id', 123, 1234), state({ selectedRouteId: 'other' }));
    expect(push).toHaveBeenLastCalledWith('/statedongle/log_id/0/2', undefined);
  });

  describe('zooming out', () => {
    const at = (extra, locState) => state({ router: { location: { pathname: '/statedongle/log_id/0/2', search: '', state: locState } }, ...extra });

    it('goes back when the zoom-in entry is the previous one', () => {
      run(popTimelineRange('log_id'), at({ zoom: { start: 0, end: 2000 } }, { zoomOut: true }));
      expect(goBack).toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    });

    it('navigates to the previous range', () => {
      run(popTimelineRange('log_id'), at({ zoom: { start: 0, end: 2000, previous: { start: 0, end: 9000 } } }));
      expect(push).toHaveBeenCalledWith('/statedongle/log_id/0/9', undefined);
    });

    it('falls back to the whole drive after a reload', () => {
      run(popTimelineRange('log_id'), at({ zoom: { start: 0, end: 2000 } }));
      expect(push).toHaveBeenCalledWith('/statedongle/log_id', undefined);
      expect(goBack).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['Prime', primeNav, '/statedongle/prime'],
    ['stream', streamNav, '/statedongle/stream'],
  ])('pushes the %s URL while opening and the dashboard while closing', (_name, action, expected) => {
    run(action(true));
    expect(push).toHaveBeenLastCalledWith(expected, undefined);
    run(action(false));
    expect(push).toHaveBeenLastCalledWith('/statedongle', undefined);
  });

  it('does nothing without a selected device', () => {
    run(primeNav(true), state({ dongleId: null }));
    expect(push).not.toHaveBeenCalled();
  });

  it('pushes the device URL when selecting a device', () => {
    run(selectDevice(DONGLE));
    expect(push).toHaveBeenCalledWith(`/${DONGLE}`, undefined);
  });

  it('does nothing when the URL is already current', () => {
    const current = state({ router: { location: { pathname: '/statedongle', search: '' } } });
    run(navigate({ view: 'dashboard', dongleId: 'statedongle' }), current);
    expect(push).not.toHaveBeenCalled();
  });
});
