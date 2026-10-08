import { vi } from 'vitest';
import { push } from 'connected-react-router';
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
  };
});

describe('timeline actions', () => {
  it.each([
    ['whole drive', null, null, '/statedongle/log_id'],
    ['full drive range', 0, 40000, '/statedongle/log_id'],
    ['drive range', 10000, 20000, '/statedongle/log_id/10/20'],
    ['zero-start drive range', 0, 20000, '/statedongle/log_id/0/20'],
  ])('generates a %s URL when editing zoom', (_name, start, end, expected) => {
    vi.clearAllMocks();

    const dispatch = vi.fn();
    const getState = () => ({
      dongleId: 'statedongle',
      routes: [{ log_id: 'log_id', duration: 40000 }],
      router: { location: { pathname: '/statedongle' } },
    });

    pushTimelineRange('log_id', start, end)(dispatch, getState);
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
});
