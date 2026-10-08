import { vi } from 'vitest';
import { push, replace } from 'connected-react-router';
import {
  normalizeDriveRange, primeNav, pushTimelineRange, streamNav, urlForState,
} from './index';

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
    replace: vi.fn((path) => ({ type: 'replace', path })),
  };
});

describe('timeline actions', () => {
  it.each([
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['zero-start drive range', ['dongle', 'log', 0, 20, false], '/dongle/log/0/20'],
    ['Prime', ['dongle', null, null, null, true], '/dongle/prime'],
  ])('generates a %s URL', (_name, args, expected) => {
    expect(urlForState(...args)).toBe(expected);
  });

  it('should push history state when editing zoom', () => {
    const dispatch = vi.fn();
    const getState = vi.fn();
    const actionThunk = pushTimelineRange("log_id", 123, 1234);

    getState.mockImplementationOnce(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith('/statedongle/log_id/0.123/1.234');
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

describe('normalizeDriveRange', () => {
  const D = 'aaaaaaaaaaaaaaaa';
  const L = '2026-08-06--12-00-00';
  const run = (pathname, duration, search = '') => {
    const dispatch = vi.fn();
    normalizeDriveRange()(dispatch, () => ({
      router: { location: { pathname, search, hash: '' } },
      routesMeta: { dongleId: D },
      routes: [{ log_id: L, duration }],
    }));
    return dispatch;
  };

  beforeEach(() => replace.mockClear());

  it('clamps an overlong range and keeps the query', () => {
    run(`/${D}/${L}/10/90`, 60000, `?settings=${D}`);
    expect(replace).toHaveBeenCalledWith(`/${D}/${L}/10/60?settings=${D}`);
  });

  it('drops a zero-start overlong range', () => {
    run(`/${D}/${L}/0/90`, 60000);
    expect(replace).toHaveBeenCalledWith(`/${D}/${L}`);
  });

  it.each([64001, 64004, 64000.6])('keeps a range ending at a %s ms duration', (duration) => {
    const end = (duration / 1000).toFixed(3);
    const dispatch = run(`/${D}/${L}/10/${Number(end)}`, duration);
    expect(replace).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
