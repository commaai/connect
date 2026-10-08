import { vi } from 'vitest';
import { push } from 'connected-react-router';
import {
  popTimelineRange, primeNav, pushTimelineRange, selectDevice, streamNav,
} from './index';

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn((path) => ({ type: 'TEST_PUSH', path })),
  };
});

// run nested thunks the way redux-thunk would
const runWith = (state) => {
  const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, () => state) : action));
  return dispatch;
};

beforeEach(() => push.mockClear());

const state = (overrides = {}) => ({
  dongleId: 'statedongle',
  router: { location: { pathname: '/elsewhere' } },
  routes: [{ log_id: 'log_id', duration: 60000 }],
  zoom: null,
  ...overrides,
});

describe('timeline actions', () => {
  it.each([
    ['whole drive', ['log_id', 0, 60000], '/statedongle/log_id'],
    ['drive range', ['log_id', 10000, 20000], '/statedongle/log_id/10/20'],
    ['dashboard', [null, null, null], '/statedongle'],
  ])('pushes a %s URL', (_name, args, expected) => {
    const dispatch = runWith(state());
    dispatch(pushTimelineRange(...args));
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('pops back to the whole drive when there is no previous zoom', () => {
    const dispatch = runWith(state({ zoom: { start: 10000, end: 20000, previous: null } }));
    dispatch(popTimelineRange('log_id'));
    expect(push).toHaveBeenCalledWith('/statedongle/log_id');
  });

  it('pops to the previous zoom range', () => {
    const dispatch = runWith(state({
      zoom: { start: 12000, end: 15000, previous: { start: 10000, end: 20000 } },
    }));
    dispatch(popTimelineRange('log_id'));
    expect(push).toHaveBeenCalledWith('/statedongle/log_id/10/20');
  });

  it.each([
    ['prime', primeNav, '/statedongle/prime'],
    ['stream', streamNav, '/statedongle/stream'],
  ])('generates the %s URL while opening', (_name, action, expected) => {
    const dispatch = runWith(state());
    dispatch(action(true));
    expect(push).toHaveBeenCalledWith(expected);
  });

  it.each([
    ['prime', primeNav],
    ['stream', streamNav],
  ])('returns to the dashboard while closing %s', (_name, action) => {
    const dispatch = runWith(state());
    dispatch(action(false));
    expect(push).toHaveBeenCalledWith('/statedongle');
  });

  it('selects a device by URL', () => {
    const dispatch = runWith(state());
    dispatch(selectDevice('otherdongle12345'));
    expect(push).toHaveBeenCalledWith('/otherdongle12345');
  });

  it('does not push when the URL already matches the destination', () => {
    const dispatch = runWith(state({ router: { location: { pathname: '/statedongle' } } }));
    dispatch(selectDevice('statedongle'));
    expect(push).not.toHaveBeenCalled();
  });
});
