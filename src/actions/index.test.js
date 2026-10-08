import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, streamNav } from './index';
import { buildLocation } from '../url';

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

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('timeline actions', () => {
  it.each([
    ['device', { page: 'device', dongleId: DONGLE }, `/${DONGLE}`],
    ['whole drive', { page: 'drive', dongleId: DONGLE, routeId: LOG }, `/${DONGLE}/${LOG}`],
    ['drive range', { page: 'drive', dongleId: DONGLE, routeId: LOG, start: 10, end: 20 }, `/${DONGLE}/${LOG}/10/20`],
    ['Prime', { page: 'prime', dongleId: DONGLE }, `/${DONGLE}/prime`],
  ])('generates a %s URL', (_name, route, expected) => {
    expect(buildLocation(route)).toBe(expected);
  });

  it('should push history state when editing zoom', () => {
    const dispatch = vi.fn();
    const getState = vi.fn();
    const actionThunk = pushTimelineRange(LOG, 123, 1234);

    getState.mockImplementationOnce(() => ({
      dongleId: DONGLE,
      loop: {},
      zoom: {},
    }));
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith(`/${DONGLE}/${LOG}`);
  });

  it.each([
    ['Prime', primeNav, 'primeNav', `/${DONGLE}/prime`],
    ['stream', streamNav, 'streamNav', `/${DONGLE}/stream`],
  ])('generates the %s URL while opening', (_name, action, stateKey, expected) => {
    const dispatch = vi.fn();
    action(true)(dispatch, () => ({ dongleId: DONGLE, [stateKey]: false }));
    expect(push).toHaveBeenCalledWith(expected);
  });
});
