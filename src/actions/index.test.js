import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, streamNav, urlForState } from './index';
import { buildPath, parsePath } from '../url';

const REAL_DONGLE = '0000aaaa0000aaaa';
const REAL_LOG = '2026-08-06--12-00-00';

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
    ['device', [REAL_DONGLE, null, null, null, false], `/${REAL_DONGLE}`],
    ['whole drive', [REAL_DONGLE, REAL_LOG, null, null, false], `/${REAL_DONGLE}/${REAL_LOG}`],
    ['drive range', [REAL_DONGLE, REAL_LOG, 10, 20, false], `/${REAL_DONGLE}/${REAL_LOG}/10/20`],
    ['zero-start drive range', [REAL_DONGLE, REAL_LOG, 0, 20, false], `/${REAL_DONGLE}/${REAL_LOG}`],
    ['Prime', [REAL_DONGLE, null, null, null, true], `/${REAL_DONGLE}/prime`],
  ])('generates a %s URL', (_name, args, expected) => {
    expect(urlForState(...args)).toBe(expected);
  });

  it('should push history state when editing zoom', () => {
    const dispatch = vi.fn();
    const getState = vi.fn();
    const actionThunk = pushTimelineRange(REAL_LOG, 123, 1234);

    getState.mockImplementationOnce(() => ({
      dongleId: REAL_DONGLE,
      loop: {},
      zoom: {},
    }));
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith(`/${REAL_DONGLE}/${REAL_LOG}`);
  });

  it.each([
    ['Prime', primeNav, 'primeNav', `/${REAL_DONGLE}/prime`],
    ['stream', streamNav, 'streamNav', `/${REAL_DONGLE}/stream`],
  ])('generates the %s URL while opening', (_name, action, stateKey, expected) => {
    const dispatch = vi.fn();
    action(true)(dispatch, () => ({ dongleId: REAL_DONGLE, [stateKey]: false }));
    expect(push).toHaveBeenCalledWith(expected);
  });
});

describe('canonical writers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['dashboard', [REAL_DONGLE, null, null, null, false], `/${REAL_DONGLE}`],
    ['whole drive', [REAL_DONGLE, REAL_LOG, null, null, false], `/${REAL_DONGLE}/${REAL_LOG}`],
    ['drive range', [REAL_DONGLE, REAL_LOG, 10, 20, false], `/${REAL_DONGLE}/${REAL_LOG}/10/20`],
    ['zero-start drive range', [REAL_DONGLE, REAL_LOG, 0, 20, false], `/${REAL_DONGLE}/${REAL_LOG}`],
    ['Prime', [REAL_DONGLE, null, null, null, true], `/${REAL_DONGLE}/prime`],
  ])('urlForState matches buildPath output for %s', (_name, args, expected) => {
    expect(urlForState(...args)).toBe(expected);
    expect(buildPath(parsePath(expected))).toBe(expected);
  });

  it('pushes a ranged drive URL converted from milliseconds', () => {
    const dispatch = vi.fn();
    const getState = () => ({
      dongleId: REAL_DONGLE,
      loop: null,
      zoom: null,
      routes: [{ log_id: REAL_LOG, duration: 60000 }],
    });
    pushTimelineRange(REAL_LOG, 10000, 20000)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(`/${REAL_DONGLE}/${REAL_LOG}/10/20`);
  });

  it('pushes a whole-drive URL when the range covers the route', () => {
    const dispatch = vi.fn();
    const getState = () => ({
      dongleId: REAL_DONGLE,
      loop: null,
      zoom: null,
      routes: [{ log_id: REAL_LOG, duration: 60000 }],
    });
    pushTimelineRange(REAL_LOG, 0, 60000)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(`/${REAL_DONGLE}/${REAL_LOG}`);
  });

  it('pushes the dashboard URL when closing a drive', () => {
    const dispatch = vi.fn();
    const getState = () => ({
      dongleId: REAL_DONGLE,
      loop: null,
      zoom: { start: 0, end: 60000 },
      selectedRouteId: REAL_LOG,
      routes: [{ log_id: REAL_LOG, duration: 60000 }],
    });
    pushTimelineRange(null, null, null)(dispatch, getState);
    expect(push).toHaveBeenCalledWith(`/${REAL_DONGLE}`);
  });

  it('pushes prime and stream URLs for a real dongle', () => {
    const dispatch = vi.fn();
    primeNav(true)(dispatch, () => ({ dongleId: REAL_DONGLE, primeNav: false }));
    expect(push).toHaveBeenCalledWith(`/${REAL_DONGLE}/prime`);
    vi.clearAllMocks();
    streamNav(true)(dispatch, () => ({ dongleId: REAL_DONGLE, streamNav: false }));
    expect(push).toHaveBeenCalledWith(`/${REAL_DONGLE}/stream`);
  });

  it('never emits query strings from writers', () => {
    const dispatch = vi.fn();
    const getState = () => ({
      dongleId: REAL_DONGLE,
      loop: null,
      zoom: null,
      routes: [{ log_id: REAL_LOG, duration: 60000 }],
    });
    pushTimelineRange(REAL_LOG, 10000, 20000)(dispatch, getState);
    for (const call of push.mock.calls) {
      expect(call[0]).not.toContain('?');
      expect(buildPath(parsePath(call[0]))).toBe(call[0]);
    }
  });
});
