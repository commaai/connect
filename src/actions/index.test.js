import { vi } from 'vitest';
import { goBack, push, replace } from 'connected-react-router';
import { closeSettings, navigate, primeNav, pushTimelineRange, streamNav } from './index';

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    goBack: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  };
});

const state = {
  dongleId: 'statedongle',
  routes: [{ log_id: 'log', duration: 60000 }],
  router: { action: 'PUSH', location: { pathname: '/statedongle' } },
};

function run(thunk, overrides = {}) {
  const getState = () => ({ ...state, ...overrides });
  const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, getState) : action));
  thunk(dispatch, getState);
}

beforeEach(() => vi.clearAllMocks());

describe('navigation actions only change the url', () => {
  it.each([
    ['a drive range', pushTimelineRange('log', 10000, 20000), '/statedongle/log/10/20'],
    ['a range from 0', pushTimelineRange('log', 0, 20000), '/statedongle/log/0/20'],
    ['the whole drive', pushTimelineRange('log', 0, 60000), '/statedongle/log'],
    ['no drive', pushTimelineRange(null, null, null), '/statedongle'],
    ['Prime', primeNav(true), '/statedongle/prime'],
    ['stream', streamNav(true), '/statedongle/stream'],
  ])('pushes %s', (_name, thunk, expected) => {
    run(thunk, { router: { location: { pathname: '/' } } });
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('does not push the url it is already on', () => {
    run(navigate({ page: 'dashboard', dongleId: 'statedongle' }));
    expect(push).not.toHaveBeenCalled();
  });

  it('closes settings with back when the app opened it', () => {
    run(closeSettings());
    expect(goBack).toHaveBeenCalled();
  });

  it('closes settings with a replace when it was opened from a link', () => {
    run(closeSettings(), { router: { action: 'POP', location: { pathname: '/statedongle/settings' } } });
    expect(replace).toHaveBeenCalledWith('/statedongle');
  });
});
