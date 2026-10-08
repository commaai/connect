import { vi } from 'vitest';
import { push } from 'connected-react-router';
import * as Types from './types';
import { popTimelineRange, primeNav, pushTimelineRange, streamNav, urlForState } from './index';
import { createInitialState } from '../initialState';
import rootReducer from '../reducers';
import { registerPlaybackClock } from '../timeline';

vi.mock('../store', () => ({ default: { getState: () => ({}) } }));
vi.mock('connected-react-router', async () => ({
  ...await vi.importActual('connected-react-router'),
  push: vi.fn((pathname) => ({ type: 'TEST_NAVIGATE', pathname })),
}));

const route = { fullname: 'dongle|log', log_id: 'log', duration: 60000 };
const nextRoute = { ...route, fullname: 'dongle|next', log_id: 'next' };
function setup(overrides = {}) {
  let state = { ...createInitialState('/'), dongleId: 'dongle', routes: [route, nextRoute], ...overrides };
  const dispatch = vi.fn((action) => { state = rootReducer(state, action); });
  return { dispatch, state: () => state, run: (thunk) => thunk(dispatch, () => state) };
}
const selected = (overrides = {}) => setup({
  selectedRouteId: 'log', currentRoute: route, offset: 15000, desiredPlaySpeed: 0,
  zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 }, ...overrides,
});

describe('timeline actions', () => {
  let detachClock;
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { detachClock?.(); detachClock = undefined; });

  it.each([
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['zero-start drive range', ['dongle', 'log', 0, 20, false], '/dongle/log/0/20'],
    ['Prime', ['dongle', null, null, null, true], '/dongle/prime'],
  ])('generates a %s URL', (_name, args, expected) => {
    expect(urlForState(...args)).toBe(expected);
  });

  it.each([
    [null, null, 0, 60000, '/dongle/log'],
    [0, 60000, 0, 60000, '/dongle/log'],
    [0, 20000, 0, 20000, '/dongle/log/0/20'],
    [10000, 20000, 10000, 10000, '/dongle/log/10/20'],
    [100, 900, 100, 800, '/dongle/log/0/1'],
  ])('selects %s–%s with exact playback bounds and URL', (start, end, loopStart, duration, pathname) => {
    const app = setup();
    app.run(pushTimelineRange('log', start, end));
    expect(app.state()).toMatchObject({ offset: loopStart, desiredPlaySpeed: 1, loop: { startTime: loopStart, duration } });
    expect(push).toHaveBeenCalledWith(pathname);
  });

  it.each([[null, null], [0, 60000], [0, 20000], [10000, 20000]])('does not reset the same range %s–%s', (start, end) => {
    const app = selected({ offset: 15000, zoom: { start: start ?? 0, end: end ?? 60000 }, loop: { startTime: start ?? 0, duration: (end ?? 60000) - (start ?? 0) } });
    app.run(pushTimelineRange('log', start, end, false));
    expect(app.dispatch).not.toHaveBeenCalled();
    expect(app.state()).toMatchObject({ offset: 15000, desiredPlaySpeed: 0, seekId: 0 });
  });

  it.each([[0, 60000, 15000, 0], [10000, 12000, 10000, 1]])('preserves paused playback when selecting %s–%s', (start, end, offset, seekId) => {
    const app = selected();
    app.run(pushTimelineRange('log', start, end, false));
    expect(app.state()).toMatchObject({ desiredPlaySpeed: 0, offset, seekId, loop: { startTime: start, duration: end - start } });
  });

  it('restores the previous range without restarting playback', () => {
    const app = selected({ zoom: { start: 10000, end: 20000, previous: { start: 0, end: 60000 } } });
    app.run(popTimelineRange('log'));
    expect(app.state()).toMatchObject({ desiredPlaySpeed: 0, offset: 15000, seekId: 0, loop: { startTime: 0, duration: 60000 } });
    expect(push).toHaveBeenCalledWith('/dongle/log');
  });

  it('uses the live media position when a narrower range contains it', () => {
    const app = selected();
    detachClock = registerPlaybackClock(() => 17500);
    app.run(pushTimelineRange('log', 17000, 19000, false));
    expect(app.state()).toMatchObject({ offset: 17500, seekId: 0, desiredPlaySpeed: 0 });
  });

  it('preserves a pending explicit seek when its media clock is not ready', () => {
    const app = selected({ offset: 18000, seekId: 7 });
    detachClock = registerPlaybackClock((state) => state.seekId === 6 ? 15000 : undefined);
    app.run(pushTimelineRange('log', 17000, 19000, false));
    expect(app.state()).toMatchObject({ offset: 18000, seekId: 7 });
  });

  it.each([null, nextRoute])('does not sample an absent or different active route (%j)', (currentRoute) => {
    const app = selected({ currentRoute });
    const readClock = vi.fn(() => 17500);
    detachClock = registerPlaybackClock(readClock);
    app.run(pushTimelineRange('log', 17000, 19000, false));
    expect(readClock).not.toHaveBeenCalled();
  });

  it('resets a different route even when its range matches the old route', () => {
    const app = selected();
    const readClock = vi.fn(() => 17500);
    detachClock = registerPlaybackClock(readClock);
    app.run(pushTimelineRange('next', 10000, 20000));
    expect(app.state()).toMatchObject({ currentRoute: nextRoute, desiredPlaySpeed: 1, offset: 10000, seekId: 1 });
    expect(push).toHaveBeenCalledWith('/dongle/next/10/20');
    expect(readClock).not.toHaveBeenCalled();
  });

  it('clears the loop when closing without starting playback', () => {
    const app = selected();
    app.run(pushTimelineRange(null, null, null));
    expect(app.state()).toMatchObject({ selectedRouteId: null, zoom: null, loop: null, desiredPlaySpeed: 0 });
    expect(push).toHaveBeenCalledWith('/dongle');
  });

  it.each([[null, null, 0, 60000], [0, 20000, 0, 20000], [10000, 20000, 10000, 10000]])('initializes bounds after late metadata for %s–%s', (start, end, loopStart, duration) => {
    const app = setup({ routes: null });
    app.run(pushTimelineRange('log', start, end, false));
    app.dispatch({ type: Types.ACTION_ROUTES_METADATA, routes: [route] });
    expect(app.state()).toMatchObject({ currentRoute: route, offset: loopStart, loop: { startTime: loopStart, duration } });
    expect(push).not.toHaveBeenCalled();
  });

  it('recognizes unchanged whole-route bounds after the video start arrives', () => {
    const app = selected({ zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 } });
    app.dispatch({ type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: route.fullname, events: [
      { type: 'event', data: { event_type: 'first_road_camera_frame' }, route_offset_millis: 3000 },
    ] });
    app.dispatch.mockClear();
    app.run(pushTimelineRange('log', null, null, false));
    expect(app.dispatch).not.toHaveBeenCalled();
    expect(app.state()).toMatchObject({ offset: 15000, desiredPlaySpeed: 0, loop: { startTime: 3000, duration: 57000 } });
  });

  it.each([
    ['Prime', primeNav, 'primeNav', '/statedongle/prime'],
    ['stream', streamNav, 'streamNav', '/statedongle/stream'],
  ])('generates the %s URL while opening', (_name, action, stateKey, expected) => {
    action(true)(vi.fn(), () => ({ dongleId: 'statedongle', [stateKey]: false }));
    expect(push).toHaveBeenCalledWith(expected);
  });
});
