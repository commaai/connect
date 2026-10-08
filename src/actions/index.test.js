import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, streamNav } from './index';
import { pathFor, Pages } from '../url';

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
    ['device', { page: Pages.DASHBOARD, dongleId: 'dongle' }, '/dongle'],
    ['whole drive', { page: Pages.DRIVE, dongleId: 'dongle', routeId: 'log' }, '/dongle/log'],
    ['drive range', { page: Pages.DRIVE, dongleId: 'dongle', routeId: 'log', range: [10000, 20000] }, '/dongle/log/10/20'],
    ['Prime', { page: Pages.PRIME, dongleId: 'dongle' }, '/dongle/prime'],
  ])('builds a %s URL through pathFor', (_name, route, expected) => {
    expect(pathFor(route)).toBe(expected);
  });

  it('pushes a range URL when the timeline selects a range', () => {
    const dispatch = vi.fn();
    const getState = vi.fn();
    const actionThunk = pushTimelineRange('log_id', 123, 1234, true);

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
