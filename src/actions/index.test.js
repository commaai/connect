import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { pushTimelineRange, pageNav } from './index';

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

  it.each([
    ['Prime', 'prime', '/statedongle/prime'],
    ['stream', 'stream', '/statedongle/stream'],
    ['dashboard', undefined, '/statedongle'],
  ])('generates the %s URL', (_name, page, expected) => {
    pageNav(page)(vi.fn(), () => ({ dongleId: 'statedongle', router: { location: { pathname: '/' } } }));
    expect(push).toHaveBeenCalledWith(expected);
  });
});
