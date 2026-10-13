import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, locationFor } from '../url';
import { checkRoutesData, fetchRoute, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice } from './index';
import * as Types from './types';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';

const revisions = new WeakMap();

// Initial entry, PUSH, REPLACE, and browser Back/Forward all take this path.
export function syncLocation(location, initialized = false) {
  return async (dispatch, getState) => {
    const revision = (revisions.get(getState) || 0) + 1;
    revisions.set(getState, revision);
    const previous = getState();
    const navigation = parseLocation(location);
    dispatch({ type: Types.ACTION_LOCATION_CHANGED, navigation });
    const state = getState();
    const deviceChanged = previous.dongleId !== state.dongleId;
    if (deviceChanged) {
      webrtcConnectionManager.disconnect();
      if (state.dongleId) window.localStorage.setItem('selectedDongleId', state.dongleId);
    }
    if (state.devices === null) return;

    if ((deviceChanged || initialized) && state.dongleId) {
      const device = state.devices.find((candidate) => candidate.dongle_id === state.dongleId);
      if (device) {
        dispatch(primeFetchSubscription(state.dongleId, device));
        dispatch(fetchDeviceOnline(state.dongleId));
      } else {
        dispatch(fetchSharedDevice(state.dongleId));
      }
    }
    if (navigation.page === 'legacy') {
      try {
        const routes = await api.routes.getRoutesSegments(
          navigation.dongleId, navigation.legacy.start, navigation.legacy.end,
        );
        if (revisions.get(getState) !== revision) return;
        if (routes?.length) {
          const route = routes[0];
          const duration = route.end_time_utc_millis - route.start_time_utc_millis;
          const start = Math.max(0, navigation.legacy.start - route.start_time_utc_millis);
          const end = Math.min(duration, navigation.legacy.end - route.start_time_utc_millis);
          const range = end > start && (start !== 0 || end !== duration) ? { start, end } : null;
          dispatch(replace(locationFor({
            ...navigation, page: 'drive', logId: route.fullname.split('|')[1], range, legacy: null,
          }, location)));
          return;
        }
        dispatch({ type: Types.ACTION_ROUTE_ERROR, dongleId: state.dongleId, logId: null, error: 'Route does not exist.' });
      } catch (err) {
        if (revisions.get(getState) === revision) {
          dispatch({ type: Types.ACTION_ROUTE_ERROR, dongleId: state.dongleId, logId: null, error: 'Unable to load this drive.' });
        }
      }
    } else if (navigation.page === 'drive') {
      await dispatch(fetchRoute(navigation.dongleId, navigation.logId));
      if (revisions.get(getState) !== revision) return;
      const route = getState().currentRoute;
      if (route && navigation.range && navigation.range.end > route.duration) {
        dispatch(replace(locationFor({ ...navigation, range: null }, location)));
      }
    } else if (navigation.page === 'device') {
      if (state.limit === 0) dispatch({ type: Types.ACTION_UPDATE_ROUTE_LIMIT, limit: 5 });
      dispatch(checkRoutesData());
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) return;
  const result = next(action);
  if (action.type === LOCATION_CHANGE) dispatch(syncLocation(action.payload.location));
  return result;
};
