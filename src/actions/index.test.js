import { vi } from 'vitest';
import { navigate } from './navigation';
import { popTimelineRange, primeNav, pushTimelineRange, selectDevice, selectTimeFilter, streamNav } from './index';

vi.mock('./navigation', () => ({ navigate: vi.fn((destination) => ({ type: 'NAVIGATE', destination })) }));

const DONGLE = 'aaaaaaaaaaaaaaaa';
const LOG = '0000010a--a51155e496';
const state = {
  dongleId: DONGLE, selectedRouteId: LOG,
  zoom: { start: 0, end: 60000 }, routes: [{ log_id: LOG, duration: 60000 }],
};

beforeEach(() => vi.clearAllMocks());

describe('navigation actions', () => {
  it.each([
    [null, null, `/${DONGLE}/${LOG}`],
    [0, 60000, `/${DONGLE}/${LOG}`],
    [0, 20000, `/${DONGLE}/${LOG}/0/20`],
    [123, 1234, `/${DONGLE}/${LOG}/0.123/1.234`],
  ])('preserves the selected range %s–%s in the destination', (start, end, pathname) => {
    pushTimelineRange(LOG, start, end)(vi.fn(), () => state);
    expect(navigate).toHaveBeenCalledWith({ pathname, state: { zoomPrevious: state.zoom } });
  });

  it('ignores an empty drag range', () => {
    pushTimelineRange(LOG, 1000, 1000)(vi.fn(), () => state);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('closes a drive to its device', () => {
    pushTimelineRange(null, null, null)(vi.fn(), () => state);
    expect(navigate).toHaveBeenCalledWith({ pathname: `/${DONGLE}`, state: { zoomPrevious: null } });
  });

  it('carries the selected dashboard dates through drive open, zoom and close', () => {
    const filtered = { ...state, router: { location: { pathname: `/${DONGLE}`, search: '?from=1000&to=2000' } } };
    for (const [log, start, end, pathname] of [
      [LOG, null, null, `/${DONGLE}/${LOG}`],
      [LOG, 1000, 2000, `/${DONGLE}/${LOG}/1/2`],
      [null, null, null, `/${DONGLE}`],
    ]) {
      pushTimelineRange(log, start, end)(vi.fn(), () => filtered);
      expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ pathname, search: '?from=1000&to=2000' }));
    }
  });

  it('keeps retained dashboard dates when a drive was opened without query arguments', () => {
    const filtered = { ...state, filter: { start: 1000, end: 2000 }, router: { location: { pathname: `/${DONGLE}/${LOG}` } } };
    pushTimelineRange(null, null, null)(vi.fn(), () => filtered);
    expect(navigate).toHaveBeenLastCalledWith({ pathname: `/${DONGLE}`, search: '?from=1000&to=2000', state: { zoomPrevious: null } });
  });

  it('saves a date filter as one replacement URL and closes the filter overlay', () => {
    const dispatch = vi.fn();
    selectTimeFilter(1000, 2000)(dispatch, () => ({
      router: { location: { pathname: `/${DONGLE}`, search: '?tag=a&modal=filter&tag=b', hash: '#drives' } },
    }));
    expect(navigate).toHaveBeenCalledWith(`/${DONGLE}?tag=a&tag=b&from=1000&to=2000#drives`, true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].type).toBe('NAVIGATE');
  });

  it('restores the previous zoom and its ancestry', () => {
    const previous = { start: 0, end: 60000 };
    popTimelineRange(LOG)(vi.fn(), () => ({ ...state, currentRoute: state.routes[0], zoom: { start: 10000, end: 20000, previous } }));
    expect(navigate).toHaveBeenCalledWith({ pathname: `/${DONGLE}/${LOG}`, state: { zoomPrevious: null } });
  });

  it('device and page actions only request navigation', () => {
    selectDevice(DONGLE)(vi.fn(), () => state);
    expect(navigate).toHaveBeenLastCalledWith(`/${DONGLE}`);
    for (const [action, page] of [[primeNav, 'prime'], [streamNav, 'stream']]) {
      action(true)(vi.fn(), () => state);
      expect(navigate).toHaveBeenLastCalledWith(`/${DONGLE}/${page}`);
      action(false)(vi.fn(), () => state);
      expect(navigate).toHaveBeenLastCalledWith(`/${DONGLE}`);
    }
  });

  it('keeps the explicit date filter when reselecting the current device', () => {
    const filtered = { ...state, router: { location: { pathname: `/${DONGLE}`, search: '?from=1000&to=2000' } } };
    selectDevice(DONGLE)(vi.fn(), () => filtered);
    expect(navigate).toHaveBeenLastCalledWith(`/${DONGLE}?from=1000&to=2000`);
    selectDevice('bbbbbbbbbbbbbbbb')(vi.fn(), () => filtered);
    expect(navigate).toHaveBeenLastCalledWith('/bbbbbbbbbbbbbbbb');
  });
});
