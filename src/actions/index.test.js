import { vi } from 'vitest';
import { push, replace } from 'connected-react-router';
import { navigate, primeNav, pushTimelineRange, streamNav, selectDevice, urlForState } from './index';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(() => ({ type: 'RESET' })),
  selectLoop: vi.fn(() => ({ type: 'LOOP' })),
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn((url) => ({ type: 'PUSH', url })),
    replace: vi.fn((url) => ({ type: 'REPLACE', url })),
  };
});

function runThunk(thunk, state) {
  const dispatch = vi.fn((action) => {
    if (typeof action === 'function') return action(dispatch, getState);
    return action;
  });
  const getState = vi.fn(() => state);
  thunk(dispatch, getState);
  return { dispatch, getState };
}

function pushedUrls(dispatch) {
  return dispatch.mock.calls
    .map(([a]) => a)
    .filter((a) => a && (a.type === 'PUSH' || a.type === 'REPLACE'))
    .map((a) => a.url);
}

describe('timeline actions: state first, then URL', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range seconds', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['zero-start drive range keeps range', ['dongle', 'log', 0, 20, false], '/dongle/log/0/20'],
    ['Prime', ['dongle', null, null, null, true], '/dongle/prime'],
  ])('urlForState generates a %s URL', (_name, args, expected) => {
    expect(urlForState(...args)).toBe(expected);
  });

  it('pushes drive URL when editing zoom', () => {
    const { dispatch } = runThunk(pushTimelineRange('log_id', 123000, 1234000), {
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
      router: { location: { pathname: '/' } },
    });
    expect(pushedUrls(dispatch)).toContain('/statedongle/log_id/123/1234');
  });

  it('does not push when the URL already matches', () => {
    const { dispatch } = runThunk(
      navigate('/statedongle/log_id/123/1234'),
      { router: { location: { pathname: '/statedongle/log_id/123/1234' } } },
    );
    expect(push).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ['Prime', primeNav, 'primeNav', '/statedongle/prime'],
    ['stream', streamNav, 'streamNav', '/statedongle/stream'],
  ])('navigates to the %s URL while opening', (_name, action, stateKey, expected) => {
    const { dispatch } = runThunk(action(true), {
      dongleId: 'statedongle', [stateKey]: false, router: { location: { pathname: '/' } },
    });
    expect(pushedUrls(dispatch)).toContain(expected);
  });

  it('selectDevice navigates to the device URL', () => {
    const { dispatch } = runThunk(selectDevice('newdongle00112233'), {
      dongleId: 'olddongle00112233', devices: [], device: null, profile: null,
      filter: { start: null, end: null }, limit: 5, routes: [],
      router: { location: { pathname: '/' } },
    });
    expect(pushedUrls(dispatch)).toContain('/newdongle00112233');
  });

  it('legacy resolve uses replace so back never re-triggers it', () => {
    runThunk(
      navigate('/dongle/log/0/20', { replaceEntry: true }),
      { router: { location: { pathname: '/dongle/1000/2000' } } },
    );
    expect(replace).toHaveBeenCalledWith('/dongle/log/0/20');
  });
});
