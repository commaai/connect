import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, selectDevice, streamNav } from './index';

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn(),
  };
});

const runThunks = (getState) => {
  const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, getState) : action));
  return dispatch;
};

describe('timeline actions', () => {
  it('should push history state when editing zoom', () => {
    const getState = vi.fn();
    const actionThunk = pushTimelineRange("log_id", 123, 1234);

    getState.mockImplementation(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));
    actionThunk(runThunks(getState), getState);
    expect(push).toBeCalledWith('/statedongle/log_id/0/2');
  });

  it.each([
    ['Prime', primeNav, 'primeNav', '/statedongle/prime'],
    ['stream', streamNav, 'streamNav', '/statedongle/stream'],
  ])('generates the %s URL while opening', (_name, action, stateKey, expected) => {
    const getState = () => ({ dongleId: 'statedongle', [stateKey]: false });
    action(true)(runThunks(getState), getState);
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('does not push the URL that is already open', () => {
    const getState = () => ({ router: { location: { pathname: '/statedongle' } } });
    const dispatch = runThunks(getState);
    selectDevice('statedongle')(dispatch, getState);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
