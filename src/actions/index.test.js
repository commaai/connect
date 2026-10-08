import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, streamNav } from './index';
import { formatUrl, Pages } from '../url';

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
    ['device dashboard', { dongleId: 'dongle' }, '/dongle'],
    ['deviceless', {}, '/'],
    ['whole drive', { dongleId: 'dongle', page: Pages.DRIVE, routeId: 'log' }, '/dongle/log'],
    ['drive range', { dongleId: 'dongle', page: Pages.DRIVE, routeId: 'log', zoom: { start: 10000, end: 20000 } }, '/dongle/log/10/20'],
    ['zero-start drive range keeps its bounds', { dongleId: 'dongle', page: Pages.DRIVE, routeId: 'log', zoom: { start: 0, end: 20000 } }, '/dongle/log/0/20'],
    ['Prime', { dongleId: 'dongle', page: Pages.PRIME }, '/dongle/prime'],
    ['stream', { dongleId: 'dongle', page: Pages.STREAM }, '/dongle/stream'],
    ['referrals', { page: Pages.REFERRALS }, '/referrals'],
    ['settings modal', { dongleId: 'dongle', settingsDongleId: 'beef' }, '/dongle?settings=beef'],
  ])('generates a %s URL', (_name, url, expected) => {
    expect(formatUrl(url)).toBe(expected);
  });

  it('should push history state when editing zoom', () => {
    const dispatch = vi.fn();
    const getState = vi.fn();
    const actionThunk = pushTimelineRange('log_id', 123, 1234);

    getState.mockImplementationOnce(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith('/statedongle/log_id/0/1');
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
