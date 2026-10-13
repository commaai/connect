import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { navigate, primeNav, pushTimelineRange, selectDevice, streamNav } from './index';

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn((url) => ({ pushed: url })),
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
    expect(push).toHaveBeenCalledWith('/statedongle/log_id/0/2');
  });

  it('pushes the whole drive URL for a full-length range', () => {
    const routes = [{ log_id: 'log_id', duration: 1234 }];
    run(pushTimelineRange('log_id', 0, 1234), state({ routes }));
    expect(push).toHaveBeenCalledWith('/statedongle/log_id');
  });

  it.each([
    ['Prime', primeNav, '/statedongle/prime'],
    ['stream', streamNav, '/statedongle/stream'],
  ])('pushes the %s URL while opening and the dashboard while closing', (_name, action, expected) => {
    run(action(true));
    expect(push).toHaveBeenLastCalledWith(expected);
    run(action(false));
    expect(push).toHaveBeenLastCalledWith('/statedongle');
  });

  it('does nothing without a selected device', () => {
    run(primeNav(true), state({ dongleId: null }));
    expect(push).not.toHaveBeenCalled();
  });

  it('pushes the device URL when selecting a device', () => {
    run(selectDevice(DONGLE));
    expect(push).toHaveBeenCalledWith(`/${DONGLE}`);
  });

  it('does nothing when the URL is already current', () => {
    const current = state({ router: { location: { pathname: '/statedongle', search: '' } } });
    run(navigate({ view: 'dashboard', dongleId: 'statedongle' }), current);
    expect(push).not.toHaveBeenCalled();
  });
});
