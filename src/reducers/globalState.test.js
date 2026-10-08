import '../store';
import * as Types from '../actions/types';
import reducer from './globalState';

const route = (log_id, create_time) => ({ fullname: `dongle|${log_id}`, log_id, create_time, duration: 60000 });
const listState = {
  dongleId: 'dongle',
  routes: [route('b', 2), route('a', 1)],
  routesMeta: { dongleId: 'dongle', start: 100, end: 200 },
};

describe('route metadata reducer', () => {
  it('merges a route missing from the list and invalidates the list range', () => {
    const state = reducer(listState, {
      type: Types.ACTION_ROUTES_METADATA, dongleId: 'dongle', routeOnly: true, routes: [route('c', 3)],
    });
    expect(state.routes.map(({ log_id }) => log_id)).toEqual(['c', 'b', 'a']);
    expect(state.routesMeta).toEqual({ dongleId: 'dongle', start: null, end: null });
  });

  it('keeps the list range when the route was already listed', () => {
    const state = reducer(listState, {
      type: Types.ACTION_ROUTES_METADATA, dongleId: 'dongle', routeOnly: true, routes: [route('a', 1)],
    });
    expect(state.routes.map(({ log_id }) => log_id)).toEqual(['b', 'a']);
    expect(state.routesMeta).toEqual(listState.routesMeta);
  });

  it('does not merge routes from another device', () => {
    const state = reducer({ ...listState, routesMeta: { ...listState.routesMeta, dongleId: 'other' } }, {
      type: Types.ACTION_ROUTES_METADATA, dongleId: 'dongle', routeOnly: true, routes: [route('c', 3)],
    });
    expect(state.routes.map(({ log_id }) => log_id)).toEqual(['c']);
  });
});
