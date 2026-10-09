import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseUrl, driveUrl, parseFilter, filterSearch } from '../url';
import { checkRoutesData, setDevice, selectRoute } from './index';
import { api } from '../api/backend';
import { getDefaultFilter } from '../utils/filter';
import { ACTION_SELECT_TIME_FILTER, ACTION_UPDATE_ROUTE_LIMIT } from './types';

export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let navigation = 0;
  return (next) => (action) => {
    if (!action) return;
    if (action.type !== LOCATION_CHANGE) return next(action);
    const previousFilter = parseFilter(getState().router?.location?.search);
    const result = next(action); // Commit location before synchronizing its state.

    navigation += 1;
    const revision = navigation;
    const url = parseUrl(action.payload.location.pathname);
    const filter = parseFilter(action.payload.location.search);
    const previous = getState();
    if (url.dongleId && url.dongleId !== previous.dongleId) {
      dispatch(setDevice(url.dongleId));
    }

    const desiredFilter = filter || (previousFilter ? getDefaultFilter() : getState().filter);
    const currentFilter = getState().filter;
    if (desiredFilter && (desiredFilter.start !== currentFilter?.start || desiredFilter.end !== currentFilter?.end)) {
      dispatch({ type: ACTION_SELECT_TIME_FILTER, ...desiredFilter });
      dispatch({ type: ACTION_UPDATE_ROUTE_LIMIT, limit: 5 });
    }

    const state = getState();
    // A matching URL must not reset playback or discard loaded files.
    const sameDrive = url.logId === state.selectedRouteId;
    const sameZoom = url.zoom
      ? state.zoom?.start === url.zoom.start && state.zoom?.end === url.zoom.end
      : !state.zoom || (state.zoom.start === 0 && state.zoom.end === state.currentRoute?.duration);
    if (!sameDrive || !sameZoom) {
      dispatch(selectRoute(url.logId, url.zoom?.start ?? null, url.zoom?.end ?? null));
    }

    if (url.dongleId && (state.devices || url.dongleId !== previous.dongleId || !sameDrive)) {
      dispatch(checkRoutesData());
    }

    if (url.legacyRange) {
      const { start, end } = url.legacyRange;
      api.routes.getRoutesSegments(url.dongleId, start, end).then((routes) => {
        // Navigation away and back is a different request, even at the same URL.
        if (revision !== navigation || !routes?.length) return;
        dispatch(replace(`${driveUrl(url.dongleId, routes[0].fullname.split('|')[1])}${filterSearch(filter)}`));
      }).catch((err) => console.error('Error fetching routes data for log ID conversion', err));
    }
    return result;
  };
};
