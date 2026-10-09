import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, selectDevice, streamNav } from './index';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  selectLoop: vi.fn(),
}));

vi.mock('../utils/webrtc', () => ({
  webrtcConnectionManager: { disconnect: vi.fn() },
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn(),
  };
});

const STATE = (over = {}) => ({
  dongleId: 'statedongle',
  loop: {},
  zoom: {},
  router: { location: { pathname: '/', search: '' } },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('timeline actions', () => {
  it('pushes a zoom that starts at second zero', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log_id', 0, 20000)(dispatch, () => STATE());
    expect(push).toBeCalledWith({ pathname: '/statedongle/log_id/0/20', search: '' });
  });

  it('pushes a sub-second zoom as a degenerate range, not the whole drive', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log_id', 0, 999)(dispatch, () => STATE());
    expect(push).toBeCalledWith({ pathname: '/statedongle/log_id/0/0', search: '' });
  });

  it('pushes a zoom that floors to second zero', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log_id', 123, 1234)(dispatch, () => STATE());
    expect(push).toBeCalledWith({ pathname: '/statedongle/log_id/0/1', search: '' });
  });

  it('collapses a whole-drive selection to the short URL', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log_id', null, null)(
      dispatch,
      () => STATE({ routes: [{ log_id: 'log_id', duration: 60000 }] }),
    );
    expect(push).toBeCalledWith({ pathname: '/statedongle/log_id', search: '' });
  });

  it('pushes the device URL when leaving a drive', () => {
    const dispatch = vi.fn();
    pushTimelineRange(null, null, null)(dispatch, () => STATE());
    expect(push).toBeCalledWith({ pathname: '/statedongle', search: '' });
  });

  it('does not push when the path and search already match', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log_id', 0, 20000)(
      dispatch,
      () => STATE({ router: { location: { pathname: '/statedongle/log_id/0/20', search: '' } } }),
    );
    expect(push).not.toBeCalled();
  });

  it('does not push a duplicate when the current URL carries ?ci=1', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log_id', 0, 20000)(
      dispatch,
      () => STATE({ router: { location: { pathname: '/statedongle/log_id/0/20', search: '?ci=1' } } }),
    );
    expect(push).not.toBeCalled();
  });

  it('carries ?ci=1 onto a real push', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log_id', 0, 20000)(
      dispatch,
      () => STATE({ router: { location: { pathname: '/statedongle/log', search: '?ci=1' } } }),
    );
    expect(push).toBeCalledWith({ pathname: '/statedongle/log_id/0/20', search: '?ci=1' });
  });

  it('pushes the device URL from selectDevice', () => {
    const dispatch = vi.fn();
    selectDevice('otherdongle')(dispatch, () => STATE());
    expect(push).toBeCalledWith({ pathname: '/otherdongle', search: '' });
  });

  it.each([
    ['Prime', primeNav, 'primeNav', false, { pathname: '/statedongle/prime', search: '' }],
    ['stream', streamNav, 'streamNav', false, { pathname: '/statedongle/stream', search: '' }],
  ])('generates the %s URL while opening', (_name, action, stateKey, initialFlag, expected) => {
    const dispatch = vi.fn();
    action(true)(dispatch, () => STATE({ [stateKey]: initialFlag }));
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('does not push Prime again when the path and search already match', () => {
    const dispatch = vi.fn();
    primeNav(true)(
      dispatch,
      () => STATE({ primeNav: false, router: { location: { pathname: '/statedongle/prime', search: '' } } }),
    );
    expect(push).not.toBeCalled();
  });
});
