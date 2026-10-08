import reducer from './globalState';
import { createInitialState } from '../initialState';
import { hasRoutesData } from '../timeline/segments';
import * as Types from '../actions/types';

vi.mock('../utils', () => ({ emptyDevice: {} }));

const DEVICE = 'aaaaaaaaaaaaaaaa';
const OTHER_DEVICE = 'bbbbbbbbbbbbbbbb';
const RECENT = '2026-10-07--12-00-00';
const OLD = '2025-10-07--12-00-00';
const makeRoute = (logId) => ({ log_id: logId, fullname: `${DEVICE}|${logId}`, duration: 60000 });
const recent = makeRoute(RECENT);
const old = makeRoute(OLD);
const selection = (logId) => ({ type: Types.TIMELINE_PUSH_SELECTION, log_id: logId });
const metadata = (routes, selectedRouteId = null) => ({
  type: Types.ACTION_ROUTES_METADATA, dongleId: DEVICE, selectedRouteId,
  start: 100, end: 200, routes,
});
const initial = () => ({ ...createInitialState(`/${DEVICE}`), filter: { start: 100, end: 200 } });

it('keeps a fetched old drive outside the cached dashboard list', () => {
  let state = reducer(initial(), metadata([recent]));
  const dashboard = state.routes;
  const coverage = state.routesMeta;
  state = reducer(state, selection(OLD));
  state = reducer(state, metadata([old], OLD));
  expect(state.currentRoute).toMatchObject(old);
  expect(state.routes).toBe(dashboard);
  expect(state.routesMeta).toBe(coverage);
  state = reducer(state, selection(null));
  expect(state.routes).toEqual([recent]);
  expect(hasRoutesData(state)).toBe(true);
});

it('fetching a cold drive does not claim dashboard coverage', () => {
  let state = reducer(initial(), selection(OLD));
  state = reducer(state, metadata([old], OLD));
  expect(state.routes).toBeNull();
  expect(state.zoom).toEqual({ start: 0, end: 60000, previous: null });
  expect(hasRoutesData(state)).toBe(true);
  state = reducer(state, selection(null));
  expect(hasRoutesData(state)).toBe(false);
});

it('a late dashboard result cannot evict a fetched drive from its cache', () => {
  let state = reducer(initial(), selection(OLD));
  state = reducer(state, metadata([old], OLD));
  const cached = state.currentRoute;
  state = reducer(state, metadata([recent]));
  state = reducer(state, selection(null));
  state = reducer(state, selection(OLD));
  expect(state.currentRoute).toBe(cached);
  expect(hasRoutesData(state)).toBe(true);
  expect(state.routes).toEqual([recent]);
});

it('retains enriched drive data when reopening after a filter change', () => {
  let state = reducer(initial(), metadata([old], OLD));
  state = reducer(state, {
    type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: old.fullname,
    events: [{ type: 'event', data: { event_type: 'first_road_camera_frame' }, route_offset_millis: 1234 }],
  });
  state = reducer(state, { type: Types.ACTION_UPDATE_ROUTE_LOCATION, fullname: old.fullname, locationKey: 'startLocation', location: { place: 'Home' } });
  state = reducer(state, { type: Types.ACTION_UPDATE_ROUTE, fullname: old.fullname, route: { preserved: true } });
  const enriched = state.routeCache[OLD];
  state = reducer(state, { type: Types.ACTION_SELECT_TIME_FILTER, start: 300, end: 400 });
  state = reducer(state, selection(OLD));
  expect(state.currentRoute).toBe(enriched);
  expect(state.currentRoute).toMatchObject({ videoStartOffset: 1234, startLocation: { place: 'Home' }, preserved: true });
});

it('remembers a missing drive without marking its dashboard as loaded', () => {
  let state = reducer(initial(), selection(OLD));
  state = reducer(state, metadata([], OLD));
  expect(state.routeCache[OLD]).toBeNull();
  expect(hasRoutesData(state)).toBe(true);
  state = reducer(state, selection(null));
  expect(hasRoutesData(state)).toBe(false);
});

it('drops route cache on device changes and rejects stale responses', () => {
  let state = reducer(initial(), metadata([old], OLD));
  state = reducer(state, { type: Types.ACTION_SELECT_DEVICE, dongleId: OTHER_DEVICE });
  expect(state.routeCache).toEqual({});
  state = reducer(state, metadata([old], OLD));
  expect(state.routeCache).toEqual({});
});

it('ignores old-device route enrichment even when its log ID matches', () => {
  const other = { ...old, fullname: `${OTHER_DEVICE}|${OLD}` };
  const state = reducer({ ...initial(), dongleId: OTHER_DEVICE, routeCache: { [OLD]: other } }, {
    type: Types.ACTION_UPDATE_ROUTE, fullname: old.fullname, route: { preserved: true },
  });
  expect(state.routeCache[OLD]).toBe(other);
});
