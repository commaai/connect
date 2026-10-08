import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { api } from '../api/backend';
import { buildUrl, parseUrl } from '../url';
import { applyUrl } from './index';

export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let legacyLookupKey = null;
  let generation = 0;

  const resolveLegacyRange = (location) => {
    const url = parseUrl(location);
    if (url.page !== 'legacy') {
      legacyLookupKey = null;
      generation += 1;
      return;
    }

    const { start, end } = url.legacyRange;
    const key = `${url.dongleId}|${start}|${end}`;
    if (legacyLookupKey === key) return;
    legacyLookupKey = key;
    generation += 1;
    const requestGeneration = generation;

    api.routes.getRoutesSegments(url.dongleId, start, end).then((routes) => {
      const currentLocation = getState().router.location;
      const currentUrl = parseUrl(currentLocation);
      if (requestGeneration !== generation || currentUrl.page !== 'legacy'
        || currentUrl.dongleId !== url.dongleId
        || currentUrl.legacyRange?.start !== start || currentUrl.legacyRange?.end !== end
        || !Array.isArray(routes) || routes.length === 0) {
        return;
      }

      const routeId = routes[0].fullname.split('|')[1];
      dispatch(replace(buildUrl({
        ...currentUrl,
        page: 'drive',
        routeId,
        zoom: null,
        legacyRange: null,
      }, currentLocation)));
    }).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
    });
  };

  return (next) => (action) => {
    if (action?.type !== LOCATION_CHANGE) return next(action);

    next(action);
    dispatch(applyUrl(action.payload.location));
    resolveLegacyRange(action.payload.location);
  };
};
