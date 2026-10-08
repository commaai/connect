import { vi } from 'vitest';
import { push } from 'connected-react-router';

import { primeNav, pushTimelineRange, selectDevice, streamNav } from './index';

vi.mock('../timeline', () => ({ currentOffset: vi.fn(() => 0) }));
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
    push: vi.fn((pathname) => ({ type: 'PUSH', pathname })),
  };
});

const route = { log_id: 'log_id', duration: 60000 };

function run(action, { pathname = '/', ...state } = {}) {
  const dispatch = vi.fn();
  const getState = () => ({
    router: { location: { pathname } },
    dongleId: 'statedongle',
    routes: [route],
    lastRoutes: null,
    ...state,
  });
  action(dispatch, getState);
  return dispatch;
}

const pushedPath = () => push.mock.calls[push.mock.calls.length - 1]?.[0];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('navigation actions push one canonical URL', () => {
  it.each([
    ['a device dashboard', () => selectDevice('statedongle'), '/statedongle'],
    ['Prime', () => primeNav(true), '/statedongle/prime'],
    ['the dashboard from Prime', () => primeNav(false), '/statedongle'],
    ['stream', () => streamNav(true), '/statedongle/stream'],
    ['the dashboard from stream', () => streamNav(false), '/statedongle'],
  ])('pushes %s', (_name, makeAction, expected) => {
    run(makeAction(), { pathname: '/elsewhere' });
    expect(pushedPath()).toBe(expected);
  });

  it.each([
    ['whole drive', ['log_id', 0, 60000], '/statedongle/log_id'],
    ['drive range', ['log_id', 10000, 20000], '/statedongle/log_id/10/20'],
    ['zero-start range', ['log_id', 0, 20000], '/statedongle/log_id/0/20'],
    ['dashboard', [null, null, null], '/statedongle'],
  ])('pushes the %s', (_name, args, expected) => {
    run(pushTimelineRange(...args), { pathname: '/elsewhere' });
    expect(pushedPath()).toBe(expected);
  });

  it('does not push when the URL already matches', () => {
    const dispatch = run(primeNav(true), { pathname: '/statedongle/prime' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does nothing without a selected device', () => {
    const dispatch = run(primeNav(true), { dongleId: null });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
