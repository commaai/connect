import * as Types from '../actions/types';
import { createInitialState } from '../initialState';
import rootReducer from '../reducers';
import { pause, play, reducer, resetPlayback, seek, selectLoop, videoProgress } from './playback';

vi.mock('../store', () => ({ default: { getState: () => ({}) } }));

const route = { fullname: 'device|route', log_id: 'route', duration: 60000 };
const initial = (overrides = {}) => ({
  desiredPlaySpeed: 1,
  offset: 0,
  seekId: 0,
  currentRoute: route,
  loop: null,
  ...overrides,
});

describe('media-driven playback', () => {
  afterEach(() => vi.restoreAllMocks());

  it('retains autoplay without a simulated clock or global buffering flag in initial state', () => {
    expect(createInitialState('/')).toMatchObject({ desiredPlaySpeed: 1, offset: null, seekId: 0 });
    expect(createInitialState('/')).not.toHaveProperty('startTime');
    expect(createInitialState('/')).not.toHaveProperty('isBufferingVideo');
  });

  it('changes playback controls without advancing or seeking the video', () => {
    vi.spyOn(Date, 'now').mockReturnValue(9999999999999);
    let state = initial({ offset: 1234, seekId: 7 });
    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toBe(0);
    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toBe(0.5);
    state = reducer(state, play());
    expect(state).toMatchObject({ desiredPlaySpeed: 1, offset: 1234, seekId: 7 });
  });

  it('records observed media position without issuing seek commands or wrapping loops', () => {
    const state = reducer(initial({ loop: { startTime: 0, duration: 10000 } }), videoProgress(10010, route.fullname));
    expect(state).toMatchObject({ offset: 10010, seekId: 0 });
    for (const action of [play(), pause(), { type: 'UNRELATED' }]) {
      expect(reducer(state, action)).toMatchObject({ offset: 10010, seekId: 0 });
    }
    expect(videoProgress(10010, route.fullname).type).not.toBe(Types.ACTION_SEEK);
  });

  it.each([
    [1234, 'device|old-route'],
    [NaN, route.fullname],
    [Infinity, route.fullname],
  ])('ignores stale or invalid media progress (%s, %s)', (offset, fullname) => {
    expect(reducer(initial(), videoProgress(offset, fullname))).toEqual(initial());
  });

  it('ignores media progress after leaving the route', () => {
    const state = initial({ currentRoute: null });
    expect(reducer(state, videoProgress(1234, route.fullname))).toEqual(state);
    expect(reducer(state, videoProgress(1234))).toEqual(state);
  });

  it('does not turn metadata refreshes into seeks at the loop end', () => {
    const state = initial({ offset: 10010, loop: { startTime: 0, duration: 10000 } });
    for (const action of [
      { type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: route.fullname },
      { type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: 'device|other' },
      { type: Types.ACTION_ROUTES_METADATA },
    ]) {
      expect(reducer(state, action)).toEqual(state);
    }
  });

  it('assigns a new seek identity even when repeating the same explicit target', () => {
    let state = reducer(initial(), seek(1234));
    expect(state).toMatchObject({ offset: 1234, seekId: 1 });
    state = reducer(state, seek(1234));
    expect(state).toMatchObject({ offset: 1234, seekId: 2 });
    expect(reducer(state, seek(NaN))).toEqual(state);
  });

  it.each([
    [0, 2000, -100, 0],
    [0, 2000, 3000, 2000],
    [1000, 2000, 0, 1000],
    [1000, 2000, 3000, 2000],
    [1000, 2000, 1500, 1500],
  ])('clamps seeks to loop %s–%s (%s → %s)', (start, end, target, expected) => {
    const state = initial({ offset: start, loop: { startTime: start, duration: end - start } });
    expect(reducer(state, seek(target))).toMatchObject({ offset: expected, seekId: 1 });
  });

  it('only seeks on loop selection when position lies outside the new loop', () => {
    let state = reducer(initial({ offset: 1500 }), selectLoop(1000, 2000));
    expect(state).toMatchObject({ offset: 1500, seekId: 0 });
    state = reducer(state, selectLoop(0, 1000));
    expect(state).toMatchObject({ offset: 0, seekId: 1, loop: { startTime: 0, duration: 1000 } });
    state = reducer(state, selectLoop(null, null));
    expect(state).toMatchObject({ offset: 0, seekId: 1, loop: null });
  });

  it.each([30000, 5000])('starts a range selected away from the position (%s) at its start, never its end', (offset) => {
    expect(reducer(initial({ offset }), selectLoop(10000, 12000))).toMatchObject({ offset: 10000, seekId: 1 });
  });

  it('resets to the selected loop and restores autoplay without double-counting a seek', () => {
    const state = initial({ offset: 15000, desiredPlaySpeed: 0, loop: { startTime: 10000, duration: 10000 } });
    expect(reducer(state, resetPlayback())).toMatchObject({ offset: 10000, seekId: 1, desiredPlaySpeed: 1 });
  });

  it.each([[0, 60000, 3000], [10000, 20000, 10000]])('seeks cold routes to their playable loop start (%s–%s)', (start, end, offset) => {
    const state = {
      ...createInitialState('/'), selectedRouteId: route.log_id,
      zoom: { start, end },
    };
    const loaded = rootReducer(state, { type: Types.ACTION_ROUTES_METADATA, routes: [{ ...route, videoStartOffset: 3000 }] });
    expect(loaded).toMatchObject({ offset, seekId: 1, loop: { startTime: offset, duration: end - offset } });
  });

  it('resets position when switching routes and rejects the previous route progress', () => {
    const nextRoute = { ...route, fullname: 'device|next', log_id: 'next' };
    let state = initial({ offset: 15000, routes: [route, nextRoute], zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 } });
    state = rootReducer(state, { type: Types.TIMELINE_PUSH_SELECTION, log_id: nextRoute.log_id, start: null, end: null });
    state = reducer(state, resetPlayback());
    expect(state).toMatchObject({ currentRoute: nextRoute, offset: 0, seekId: 1 });
    expect(reducer(state, videoProgress(16000, route.fullname))).toEqual(state);
    expect(reducer(state, videoProgress(50, nextRoute.fullname))).toMatchObject({ offset: 50, seekId: 1 });
  });

  it.each([[500, 3000], [5000, 5000]])('rebases late video start metadata without seeking at offset %s', (offset, expected) => {
    const state = initial({ offset, routes: [route], zoom: { start: 0, end: route.duration }, loop: { startTime: 0, duration: route.duration } });
    const updated = rootReducer(state, {
      type: Types.ACTION_UPDATE_ROUTE_EVENTS,
      fullname: route.fullname,
      events: [{ type: 'event', data: { event_type: 'first_road_camera_frame' }, route_offset_millis: 3000 }],
    });
    expect(updated).toMatchObject({ offset: expected, seekId: 0, loop: { startTime: 3000, duration: 57000 } });
    expect(reducer(updated, videoProgress(offset + 3000, route.fullname))).toMatchObject({ offset: offset + 3000, seekId: 0 });
    expect(reducer(updated, seek(0))).toMatchObject({ offset: 3000, seekId: 1 });
  });

  it('does not create a negative loop for ranges entirely before video starts', () => {
    const state = initial({ currentRoute: { ...route, videoStartOffset: 3000 } });
    expect(reducer(state, selectLoop(0, 2000))).toMatchObject({ offset: 2000, loop: { startTime: 2000, duration: 0 } });
  });
});
