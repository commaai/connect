import '../store';
import * as Types from '../actions/types';
import globalStateReducer from './globalState';

it('clears the zoom stack when the selected route changes', () => {
  const routes = [
    { log_id: 'route-a', duration: 60000 },
    { log_id: 'route-b', duration: 60000 },
  ];
  const state = globalStateReducer({
    selectedRouteId: 'route-b',
    zoom: { start: 10000, end: 20000, previous: { start: 5000, end: 15000 } },
    routes,
  }, {
    type: Types.TIMELINE_PUSH_SELECTION,
    log_id: 'route-a',
    start: 0,
    end: 60000,
  });
  expect(state.selectedRouteId).toBe('route-a');
  expect(state.zoom).toEqual({ start: 0, end: 60000, previous: null });
});
