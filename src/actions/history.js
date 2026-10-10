import { LOCATION_CHANGE, replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { parseRoute, buildUrl, ROUTES } from '../url';
import { getDefaultFilter } from '../utils/filter';
import { webrtcConnectionManager } from '../utils/webrtc';
import { checkRoutesData, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice } from './index';
import { ACTION_ROUTE_CHANGE, ACTION_UPDATE_ROUTE_LIMIT } from './types';
import { api } from '../api/backend';

export function syncRoute(location, defaultDongleId, initialize = false) {
  return async (dispatch, getState) => {
    const before = getState();
    const route = parseRoute(location);
    const stored = window.localStorage.getItem('selectedDongleId');
    const fallback = before.devices?.find((d) => d.dongle_id === stored)?.dongle_id
      || defaultDongleId || before.devices?.[0]?.dongle_id || null;
    const dongleId = route?.dongleId || before.dongleId || fallback;
    if (before.devices && route?.type === ROUTES.HOME && dongleId) {
      dispatch(replace({ ...location, pathname: buildUrl({ dongleId }) }));
      return;
    }
    dispatch({ type: ACTION_ROUTE_CHANGE, route, dongleId, previousZoom: location.state?.previousZoom, filter: getDefaultFilter(), now: Date.now() });
    const state = getState();
    const changedDevice = before.dongleId !== dongleId;
    if (changedDevice && before.dongleId) webrtcConnectionManager.disconnect();
    if (!state.devices || !dongleId) return;
    if (initialize || changedDevice || !before.device) {
      window.localStorage.setItem('selectedDongleId', dongleId);
      const device = state.devices.find((d) => d.dongle_id === dongleId);
      if (device) {
        dispatch(primeFetchSubscription(dongleId, device));
        if (!device.shared || state.profile?.superuser) dispatch(fetchDeviceOnline(dongleId));
      } else dispatch(fetchSharedDevice(dongleId));
    }
    if (route?.type === ROUTES.LEGACY) {
      const navigationId = state.navigationId;
      try {
        const routes = await api.routes.getRoutesSegments(dongleId, route.zoom.start, route.zoom.end);
        if (getState().navigationId === navigationId && routes?.length) {
          dispatch(replace({ ...location, pathname: buildUrl({ dongleId, logId: routes[0].fullname.split('|')[1] }) }));
        }
      } catch (err) {
        Sentry.captureException(err, { fingerprint: 'legacy_route_lookup' });
      }
      return;
    }
    if (!state.limit) dispatch({ type: ACTION_UPDATE_ROUTE_LIMIT, limit: 5 });
    dispatch(checkRoutesData());
  };
}

export function onHistoryMiddleware({ dispatch }) {
  return (next) => (action) => {
    if (!action) return;
    const result = next(action);
    if (action.type === LOCATION_CHANGE) dispatch(syncRoute(action.payload.location));
    return result;
  };
}
