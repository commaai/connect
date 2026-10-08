import { vi } from 'vitest';
import { checkRoutesData, selectRoute } from './index';
import * as Types from './types';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(() => ({ type: 'reset' })),
  selectLoop: vi.fn((start, end) => ({ type: 'loop', start, end })),
}));

const LOG = '2026-08-06--12-00-00';
const route = { log_id: LOG, duration: 60000 };

function run(thunk, state) {
  const dispatch = vi.fn();
  thunk(dispatch, () => state);
  return dispatch.mock.calls.map(([action]) => action);
}

describe('selectRoute', () => {
  it('opens a whole drive and restarts playback', () => {
    expect(run(selectRoute(LOG), { routes: [route], selectedRouteId: null, zoom: null })).toEqual([
      { type: Types.ACTION_SELECT_ROUTE, logId: LOG, zoom: { start: 0, end: 60000 } },
      { type: 'reset' },
      { type: 'loop', start: 0, end: 60000 },
    ]);
  });

  it('opens a zoom before the drive has loaded', () => {
    expect(run(selectRoute(LOG, { start: 10000, end: 20000 }), { routes: null, selectedRouteId: null, zoom: null })[0])
      .toEqual({ type: Types.ACTION_SELECT_ROUTE, logId: LOG, zoom: { start: 10000, end: 20000 } });
  });

  it('closes the drive', () => {
    expect(run(selectRoute(null), { routes: [route], selectedRouteId: LOG, zoom: { start: 0, end: 60000 } })).toEqual([
      { type: Types.ACTION_SELECT_ROUTE, logId: null, zoom: null },
      { type: 'reset' },
      { type: 'loop', start: undefined, end: undefined },
    ]);
  });

  it.each([
    ['the whole drive', null, { start: 0, end: 60000 }],
    ['a zoom', { start: 10000, end: 20000 }, { start: 10000, end: 20000 }],
  ])('keeps playback when %s is already open', (_name, zoom, stateZoom) => {
    expect(run(selectRoute(LOG, zoom), { routes: [route], selectedRouteId: LOG, zoom: stateZoom })).toEqual([]);
  });
});

describe('checkRoutesData', () => {
  it('does not fetch a drive that is already loaded', () => {
    const state = { dongleId: 'dongle', routes: [route], selectedRouteId: LOG, routesMeta: { dongleId: null } };
    expect(run(checkRoutesData(), state)).toEqual([]);
  });
});
