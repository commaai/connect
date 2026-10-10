import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { api } from '../api/backend';
import { checkRoutesData, primeNav, pushTimelineRange, streamNav, urlForState } from './index';

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
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['zero-start drive range', ['dongle', 'log', 0, 20, false], '/dongle/log'],
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
    expect(push).toBeCalledWith('/statedongle/log_id');
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

describe('checkRoutesData', () => {
  it('keeps segments uploaded after a stale route end time', async () => {
    // public route 0d1af2138f65dbe2|0000000f: segments 0-38 were uploaded, but it ends 2s into segment 33
    const start = 1729908716000;
    const end = start + 1982000;
    const segments = [...Array(39).keys()];
    vi.spyOn(api.routes, 'getRoutesSegments').mockResolvedValueOnce([{
      fullname: '0d1af2138f65dbe2|0000000f--5320d0f46e',
      url: '',
      segment_numbers: segments,
      segment_start_times: segments.map((n) => start + (n * 60000)),
      segment_end_times: segments.map((n) => Math.min(start + ((n + 1) * 60000), end)),
    }]);

    const state = { dongleId: '0d1af2138f65dbe2', filter: { start: 0, end: 1 }, limit: 5 };
    const [route] = await checkRoutesData()(vi.fn(), () => state);
    expect(route.duration).toBe(38 * 60000);
    expect(route.segment_durations).toEqual([...Array(38).fill(60000), 0]);
  });
});
