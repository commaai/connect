import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { goBackRange, goToPrime, goToRange, goToStream } from './index';

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
  it('writes the previous range URL without changing timeline state first', () => {
    const previous = { start: 10000, end: 30000 };
    const state = { dongleId: 'statedongle', zoom: { start: 15000, end: 20000, previous } };
    const dispatched = [];
    push.mockReturnValue({ type: 'NAVIGATE' });
    const dispatch = (action) => typeof action === 'function' ? action(dispatch, () => state) : dispatched.push(action);
    dispatch(goBackRange('log_id'));
    expect(push).toHaveBeenCalledWith('/statedongle/log_id/10/30');
    expect(dispatched).toEqual([{ type: 'NAVIGATE' }]);
    expect(state.zoom.previous).toBe(previous);
  });
  it('should push history state when editing zoom', () => {
    const state = { dongleId: 'statedongle', loop: {}, zoom: {} };
    const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, () => state) : action));
    dispatch(goToRange('log_id', 123, 1234));
    expect(push).toBeCalledWith('/statedongle/log_id/0/1');
  });

  it('keeps a range that starts at zero in the URL', () => {
    const state = { dongleId: 'statedongle', loop: {}, zoom: {}, routes: [{ log_id: 'log_id', duration: 60000 }] };
    const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, () => state) : action));
    dispatch(goToRange('log_id', 0, 20000));
    expect(push).toBeCalledWith('/statedongle/log_id/0/20');
    push.mockClear();
    dispatch(goToRange('log_id', 0, 60000));
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
