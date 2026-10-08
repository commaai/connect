import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { goToDevice, openReferrals, openSettings, primeNav, pushTimelineRange, streamNav } from './index';

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
  beforeEach(() => {
    push.mockClear();
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
    ['whole drive', [0, 60000], '/statedongle/log_id'],
    ['drive range', [10000, 20000], '/statedongle/log_id/10/20'],
    ['range starting in the first second', [0, 20000], '/statedongle/log_id'],
  ])('generates the URL of a %s', (_name, [start, end], expected) => {
    const state = { dongleId: 'statedongle', loop: {}, zoom: {}, routes: [{ log_id: 'log_id', duration: 60000 }] };
    pushTimelineRange('log_id', start, end)(vi.fn(), () => state);
    expect(push).toHaveBeenCalledWith(expected);
  });

  it.each([
    ['Prime', primeNav, 'primeNav', '/statedongle/prime'],
    ['stream', streamNav, 'streamNav', '/statedongle/stream'],
  ])('generates the %s URL while opening', (_name, action, stateKey, expected) => {
    const dispatch = vi.fn();
    action(true)(dispatch, () => ({ dongleId: 'statedongle', [stateKey]: false }));
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('does not push the URL it is already on', () => {
    const state = { dongleId: 'statedongle', primeNav: false, router: { location: { pathname: '/statedongle/prime' } } };
    primeNav(true)(vi.fn(), () => state);
    expect(push).not.toHaveBeenCalled();
  });

  it('opens settings of the selected device without reselecting it', () => {
    const dispatch = vi.fn();
    openSettings('statedongle')(dispatch, () => ({ dongleId: 'statedongle' }));
    expect(push).toHaveBeenCalledWith('/statedongle/settings');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('selects another device before opening its settings', () => {
    const dispatch = vi.fn();
    openSettings('other')(dispatch, () => ({ dongleId: 'statedongle' }));
    expect(dispatch).toHaveBeenCalledWith(expect.any(Function));
    expect(push).toHaveBeenCalledWith('/other/settings');
  });

  it('opens referrals and goes back to the device', () => {
    openReferrals()(vi.fn(), () => ({ dongleId: 'statedongle' }));
    expect(push).toHaveBeenLastCalledWith('/referrals');
    goToDevice()(vi.fn(), () => ({ dongleId: 'statedongle', router: { location: { pathname: '/referrals' } } }));
    expect(push).toHaveBeenLastCalledWith('/statedongle');
  });
});
