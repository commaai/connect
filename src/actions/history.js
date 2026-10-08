import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { parse, urlFor } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import { checkLastRoutesData, checkRoutesData, fetchDeviceOnline, primeFetchSubscription } from './index';

// `/` goes to the remembered device if it's still paired, else the first one.
// Needs the device list: runs on navigation and again from startup, which
// passes the list in API order.
export function resolveRoot(devices = null) {
  return (dispatch, getState) => {
    const { page } = getState();
    const list = devices ?? getState().devices;
    if (page !== 'root' || !list?.length) return;
    const remembered = window.localStorage.getItem('selectedDongleId');
    const device = list.find((d) => d.dongle_id === remembered) || list[0];
    dispatch(replace(urlFor({ page: 'dashboard', dongleId: device.dongle_id, modal: getState().modal })));
  };
}

// Old links name a drive by its time range. Swap in the drive's URL once it's
// found, unless the user has navigated elsewhere in the meantime.
function resolveLegacy(location) {
  return async (dispatch, getState) => {
    const { dongleId, zoom } = parse(location);
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, zoom.start, zoom.end);
      const route = routes?.[0];
      if (route && getState().router.location.pathname === location.pathname) {
        dispatch(replace(urlFor({ page: 'drive', dongleId, logId: route.fullname.split('|')[1] })));
      }
    } catch (err) {
      console.error('Error resolving legacy route URL', err);
    }
  };
}

// Side effects of navigation. The state itself comes from reducers/location.js.
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) return undefined;
  if (action.type !== LOCATION_CHANGE) return next(action);
  const prev = getState();
  const result = next(action);

  const state = getState();
  if (state.page === 'root') dispatch(resolveRoot());
  if (state.page === 'unknown') dispatch(replace('/'));
  if (state.page === 'legacy') dispatch(resolveLegacy(action.payload.location));

  if (state.dongleId !== prev.dongleId) {
    window.localStorage.setItem('selectedDongleId', state.dongleId);
    if (prev.dongleId) webrtcConnectionManager.disconnect();
    if ((state.device && !state.device.shared) || state.profile?.superuser) {
      dispatch(primeFetchSubscription(state.dongleId, state.device));
      dispatch(fetchDeviceOnline(state.dongleId));
    }
    dispatch(checkLastRoutesData());
  } else if (state.selectedRouteId !== prev.selectedRouteId && state.selectedRouteId && !state.currentRoute) {
    // back/forward can land on a drive outside the loaded routes
    dispatch(checkRoutesData());
  }
  return result;
};
