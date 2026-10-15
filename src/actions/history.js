import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, pathFor } from '../url';
import { checkRoutesData, checkLastRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

// All navigation (including PUSH) follows the same URL -> state flow. The
// generation belongs to this store, so a late legacy lookup cannot navigate it.
export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let generation = 0;
  return (next) => (action) => {
    if (!action) return;

    // Store the new location before applying the page state.
    const result = next(action);
    if (action.type !== LOCATION_CHANGE) return result;
    generation += 1;

    const currentGeneration = generation;
    const location = action.payload.location;
    const route = parseLocation(location);
    if (route.page === 'auth') return result;

    const changedDevice = route.dongleId && route.dongleId !== getState().dongleId;
    if (changedDevice) dispatch(selectDevice(route.dongleId, false, false));
    if ((route.page === 'prime') !== getState().primeNav) dispatch(primeNav(route.page === 'prime', false));
    if ((route.page === 'stream') !== getState().streamNav) dispatch(streamNav(route.page === 'stream', false));

    const state = getState();
    // A drive URL without a range selects the whole drive once its duration is known.
    const zoom = route.zoom || (route.routeId && state.currentRoute?.log_id === route.routeId
      ? { start: 0, end: state.currentRoute.duration } : null);


    // Preserve playback when navigation changes only the dialog.
    const changedRoute = route.routeId !== state.selectedRouteId;

    if (changedRoute
      || (route.routeId && (zoom?.start !== state.zoom?.start || zoom?.end !== state.zoom?.end))) {
      dispatch(pushTimelineRange(route.routeId, zoom?.start ?? null, zoom?.end ?? null, false));
    }
    if (changedDevice) dispatch(checkLastRoutesData());
    else if (changedRoute) dispatch(checkRoutesData());

    if (route.page === 'legacy') {
      api.routes.getRoutesSegments(route.dongleId, route.zoom.start, route.zoom.end).then((routes) => {
        // Ignore the lookup if the user has navigated elsewhere while it was pending.
        if (generation !== currentGeneration || !routes?.length) return;
        const routeId = routes[0].fullname.split('|')[1];
        // Replace, rather than push, so Back doesn't return to the legacy URL.
        dispatch(replace({ ...location, pathname: pathFor({ page: 'drive', dongleId: route.dongleId, routeId }) }));
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }
    return result;
  };
};
