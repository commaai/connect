import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { goToPrime, goToRange, goToStream } from './index';

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
  it('should push history state when editing zoom', () => {
    const state = { dongleId: 'statedongle', loop: {}, zoom: {} };
    const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, () => state) : action));
    dispatch(goToRange('log_id', 123, 1234));
    expect(push).toBeCalledWith('/statedongle/log_id');
  });

  it.each([
    ['Prime', goToPrime, 'primeNav', '/statedongle/prime'],
    ['stream', goToStream, 'streamNav', '/statedongle/stream'],
  ])('generates the %s URL while opening', (_name, action, stateKey, expected) => {
    const state = { dongleId: 'statedongle', [stateKey]: false };
    const dispatch = vi.fn((a) => (typeof a === 'function' ? a(dispatch, () => state) : a));
    dispatch(action(true));
    expect(push).toHaveBeenCalledWith(expected);
  });
});
