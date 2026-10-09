import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, popTimelineRange, streamNav } from './index';

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

beforeEach(() => vi.clearAllMocks());

describe('timeline actions', () => {
  it.each([
    ['whole drive', null, null, '/statedongle/log_id'],
    ['full drive range', 0, 40000, '/statedongle/log_id'],
    ['drive range', 10000, 20000, '/statedongle/log_id/10/20'],
    ['zero-start drive range', 0, 20000, '/statedongle/log_id/0/20'],
  ])('generates a %s URL when editing zoom', (_name, start, end, expected) => {
    const getState = () => ({
      dongleId: 'statedongle',
      routes: [{ log_id: 'log_id', duration: 40000 }],
      router: { location: { pathname: '/statedongle' } },
    });
    pushTimelineRange('log_id', start, end)(vi.fn(), getState);
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('navigates to the previous zoom range', () => {
    const getState = () => ({
      dongleId: 'statedongle',
      routes: [{ log_id: 'log_id', duration: 40000 }],
      zoom: {
        start: 10000,
        end: 20000,
        previous: { start: 0, end: 40000 },
      },
      router: { location: { pathname: '/statedongle/log_id/10/20' } },
    });
    const dispatch = vi.fn((action) => {
      if (typeof action === 'function') return action(dispatch, getState);
    });
    popTimelineRange('log_id')(dispatch, getState);
    expect(push).toHaveBeenCalledWith('/statedongle/log_id');
  });

  it.each([
    ['Prime', primeNav, '/statedongle/prime'],
    ['stream', streamNav, '/statedongle/stream'],
  ])('generates the %s URL while opening', (_name, action, expected) => {
    const dispatch = vi.fn();
    action(true)(dispatch, () => ({ dongleId: 'statedongle' }));
    expect(push).toHaveBeenCalledWith(expected);
  });
});
