import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, pathFor } from '../url';
import { applyTimelineRange, checkLastRoutesData, checkRoutesData, loadDevice } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => {
  let revision = 0;
  return (action) => {
    if (!action) return;
    const result = next(action); // Publish the location before its effects.
    if (action.type !== LOCATION_CHANGE) return result;
    revision += 1;
    const currentRevision = revision;
    const location = action.payload.location;
    const route = parseLocation(location);
    const state = getState();
    if (route.dongleId && route.dongleId !== state.dongleId) dispatch(loadDevice(route.dongleId));
    dispatch(applyTimelineRange(route.logId, route.range));
    if (route.dongleId) {
      if (!route.logId && getState().limit === 0) dispatch(checkLastRoutesData());
      else dispatch(checkRoutesData());
    }
    if (route.legacyRange) {
      const { start, end } = route.legacyRange;
      api.routes.getRoutesSegments(route.dongleId, start, end).then((routes) => {
        // A response belongs to this particular navigation, even if the same URL is revisited.
        if (revision !== currentRevision || !routes?.length) return;
        const logId = routes[0].fullname.split('|')[1];
        const pathname = pathFor({ page: 'drive', dongleId: route.dongleId, logId });
        dispatch(replace({ pathname, search: location.search, hash: location.hash }));
      }).catch((err) => console.error('Error fetching routes data for log ID conversion', err));
    }
    return result;
  };
};
