import { LOCATION_CHANGE } from 'connected-react-router';
import { parseUrl } from '../url';
import { checkRoutesData, checkLastRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange, goToRange } from './index';
import { api } from '../api/backend';

// History is the entry point for clicks, redirects, and browser Back/Forward.
// Keep data and playback intact when navigation only changes a dialog query.
export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let revision = 0;
  return (next) => (action) => {
    if (!action) return undefined;
    if (action.type !== LOCATION_CHANGE) return next(action);

    revision += 1;
    const navigationRevision = revision;
    const state = getState();
    const result = next(action); // Publish the new location before applying it.
    const { location } = action.payload;
    const url = parseUrl(location.pathname, location.search);
    const deviceChanged = url.dongleId && url.dongleId !== state.dongleId;

    if (deviceChanged) dispatch(selectDevice(url.dongleId, false));

    if (url.legacyRange) {
      const { start, end } = url.legacyRange;
      api.routes.getRoutesSegments(url.dongleId, start, end).then((routes) => {
        if (navigationRevision !== revision || !routes?.length) return;
        const route = routes[0];
        const logId = route.fullname.split('|')[1];
        const duration = route.end_time_utc_millis - route.start_time_utc_millis;
        dispatch(goToRange(logId, 0, duration, { wholeDrive: true }));
      }).catch((error) => {
        console.error('Error fetching routes data for log ID conversion', error);
      });
    }

    if (location.pathname !== state.router?.location.pathname && (url.logId || state.selectedRouteId)) {
      const { range } = url;
      dispatch(pushTimelineRange(url.logId, range ? range.start * 1000 : null, range ? range.end * 1000 : null));
    }
    if (deviceChanged) dispatch(state.limit === 0 ? checkLastRoutesData() : checkRoutesData());

    const prime = url.page === 'prime';
    if (prime !== state.primeNav) dispatch(primeNav(prime));
    const stream = url.page === 'stream';
    if (stream !== state.streamNav) dispatch(streamNav(stream));
    return result;
  };
};
