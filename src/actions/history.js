import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { buildUrl, parseUrl } from '../url';
import { checkRoutesData, checkLastRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange, popTimelineRange } from './index';
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
        dispatch(replace({ ...location, pathname: buildUrl({ page: 'drive', dongleId: url.dongleId, logId }) }));
      }).catch((error) => {
        console.error('Error fetching routes data for log ID conversion', error);
      });
    }

    if (location.pathname !== state.router?.location.pathname && (url.logId || state.selectedRouteId)) {
      const { range } = url;
      const previous = state.zoom?.previous;
      // Returning to the previous URL restores its selection instead of pushing
      // it again. This applies equally to the drive Back button and browser history.
      const returnsToPrevious = !deviceChanged && url.logId === state.selectedRouteId && previous
        && (range
          ? range.start === Math.floor(previous.start / 1000) && range.end === Math.floor(previous.end / 1000)
          : previous.start === 0 && previous.end === state.currentRoute?.duration);
      if (returnsToPrevious) {
        dispatch(popTimelineRange());
      } else {
        dispatch(pushTimelineRange(url.logId, range ? range.start * 1000 : null, range ? range.end * 1000 : null));
      }
    }
    if (deviceChanged) dispatch(state.limit === 0 ? checkLastRoutesData() : checkRoutesData());

    const prime = url.page === 'prime';
    if (prime !== state.primeNav) dispatch(primeNav(prime));
    const stream = url.page === 'stream';
    if (stream !== state.streamNav) dispatch(streamNav(stream));
    return result;
  };
};
