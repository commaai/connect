import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { closeSettings, openSettings, primeNav, pushTimelineRange, streamNav } from './index';

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
    push: vi.fn((path) => ({ push: path })),
    replace: vi.fn((path) => ({ replace: path })),
  };
});

describe('timeline actions', () => {
  it('should push history state when editing zoom', () => {
    const dispatch = vi.fn();
    const getState = vi.fn();
    const actionThunk = pushTimelineRange("log_id", 123000, 1234000);

    getState.mockImplementationOnce(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith('/statedongle/log_id/123/1234');
  });

  it.each([
    ['Prime', primeNav, 'primeNav', '/statedongle/prime'],
    ['stream', streamNav, 'streamNav', '/statedongle/stream'],
  ])('generates the %s URL while opening', (_name, action, stateKey, expected) => {
    const dispatch = vi.fn();
    action(true)(dispatch, () => ({ dongleId: 'statedongle', [stateKey]: false }));
    expect(push).toHaveBeenCalledWith(expected);
  });

  it.each([
    ['the selected device', 'statedongle', ['/statedongle/settings']],
    ['another device', 'other00000000000', ['/other00000000000/settings']],
  ])('opens %s settings with exactly one history entry', (_name, dongleId, expected) => {
    const state = { dongleId: 'statedongle', devices: [], routes: null, filter: { start: 0, end: 1 }, router: { location: { pathname: '/statedongle' } } };
    const dispatched = [];
    const dispatch = (action) => (typeof action === 'function' ? action(dispatch, () => state) : dispatched.push(action));
    push.mockClear();
    openSettings(dongleId)(dispatch, () => state);
    expect(push.mock.calls.map(([path]) => path)).toEqual(expected);
  });

  it('closing settings returns to the device page', () => {
    const dispatch = vi.fn();
    closeSettings()(dispatch, () => ({ router: { location: { pathname: '/0000aaaa0000aaaa/settings' } } }));
    expect(dispatch).toHaveBeenCalledWith({ replace: '/0000aaaa0000aaaa' });
  });

  it('closing settings does not undo a navigation that already left them', () => {
    const dispatch = vi.fn();
    closeSettings()(dispatch, () => ({ router: { location: { pathname: '/0000aaaa0000aaaa/prime' } } }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
