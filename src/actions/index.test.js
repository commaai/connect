import { vi } from 'vitest';
import { selectRoute } from './index';
import * as Types from './types';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: () => ({ type: 'reset' }),
  selectLoop: (start, end) => ({ type: 'loop', start, end }),
}));

const route = { log_id: 'log_id', duration: 60000 };

function run(state, routeId, zoom) {
  const dispatch = vi.fn();
  selectRoute(routeId, zoom)(dispatch, () => state);
  return dispatch.mock.calls.map(([action]) => action);
}

describe('selectRoute', () => {
  it('selects a zoom and restarts playback inside it', () => {
    const zoom = { start: 10000, end: 20000 };
    expect(run({ routes: [route], selectedRouteId: null, zoom: null }, 'log_id', zoom)).toEqual([
      { type: Types.ACTION_SELECT_ROUTE, routeId: 'log_id', route, zoom },
      { type: 'reset' },
      { type: 'loop', start: 10000, end: 20000 },
    ]);
  });

  it('selects the whole drive without a zoom', () => {
    const [action] = run({ routes: [route], selectedRouteId: null, zoom: null }, 'log_id', null);
    expect(action.zoom).toEqual({ start: 0, end: 60000 });
  });

  it('waits for the drive to load before it knows the whole drive', () => {
    const [action] = run({ routes: null, selectedRouteId: null, zoom: null }, 'log_id', null);
    expect(action).toMatchObject({ route: null, zoom: null });
  });

  it('keeps a drive that was loaded on its own while its zoom changes', () => {
    const state = { routes: [], selectedRouteId: 'log_id', currentRoute: route, zoom: { start: 0, end: 60000 } };
    const [action] = run(state, 'log_id', { start: 10000, end: 20000 });
    expect(action.route).toBe(route);
  });

  it.each([
    ['a zoom', { start: 10000, end: 20000 }, { start: 10000, end: 20000 }],
    ['the whole drive', { start: 0, end: 60000 }, null],
  ])('keeps playback when %s is already selected', (_name, zoom, requested) => {
    expect(run({ routes: [route], selectedRouteId: 'log_id', currentRoute: route, zoom }, 'log_id', requested)).toEqual([]);
  });

  it('keeps playback when no drive stays selected', () => {
    expect(run({ routes: [route], selectedRouteId: null, zoom: null }, null, null)).toEqual([]);
  });
});
