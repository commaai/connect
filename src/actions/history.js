import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { currentView, deviceUrl, driveUrl } from '../url';
import { checkRoutesData, primeFetchSubscription, fetchSharedDevice, fetchDeviceOnline } from './index';
import { webrtcConnectionManager } from '../utils/webrtc';
import * as Types from './types';

// Every entry and history action applies the URL before fetching its data.
export function reconcileLocation(startupDevices = null) {
  return (dispatch, getState) => {
    let state = getState();
    const location = state.router.location;
    const view = currentView(state);
    if (view.page === 'auth') return;
    const devices = startupDevices || state.devices;
    const saved = window.localStorage.getItem('selectedDongleId');
    const fallback = devices?.find((d) => d.dongle_id === saved)?.dongle_id || devices?.[0]?.dongle_id;
    if (['home', 'demo'].includes(view.page) && fallback) {
      dispatch(replace({ ...location, pathname: deviceUrl(fallback) }));
      return;
    }
    if (view.canonicalPath !== location.pathname || view.canonicalSearch !== (location.search || '')) {
      dispatch(replace({ ...location, pathname: view.canonicalPath, search: view.canonicalSearch }));
      return;
    }
    const route = state.routeMetadata[`${view.dongleId}|${view.logId}`];
    if (view.range && route && view.range.end > route.duration) {
      const start = view.range.start;
      const pathname = start >= route.duration || start === 0
        ? driveUrl(view.dongleId, view.logId)
        : driveUrl(view.dongleId, view.logId, start, route.duration);
      dispatch(replace({ ...location, pathname }));
      return;
    }
    const dongleId = view.dongleId || (view.page === 'referrals' ? state.dongleId || fallback || null : null);
    const deviceChanged = dongleId !== state.dongleId;
    dispatch({ type: Types.ACTION_APPLY_LOCATION, view: { ...view, dongleId } });
    if (deviceChanged) {
      if (state.dongleId) webrtcConnectionManager.disconnect();
      if (dongleId) window.localStorage.setItem('selectedDongleId', dongleId);
    }
    state = getState();
    if (dongleId && ['dashboard', 'drive', 'legacy'].includes(view.page)) dispatch(checkRoutesData());
    if (deviceChanged || startupDevices) {
      const device = state.devices?.find((d) => d.dongle_id === dongleId);
      if (device) {
        dispatch(primeFetchSubscription(dongleId, device));
        if (!device.shared || state.profile?.superuser) dispatch(fetchDeviceOnline(dongleId));
      } else if (dongleId && state.devices && !state.device?.fetched_at) dispatch(fetchSharedDevice(dongleId));
    }
  };
}

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) return;
  const result = next(action);
  const state = getState();
  const route = state.routeMetadata[`${state.dongleId}|${state.selectedRouteId}`];
  // Startup resolves device destinations; metadata resolves a drive or its bounds.
  // Both re-enter the same selection path against the current location.
  const routeLoaded = action.type === Types.ACTION_ROUTES_METADATA && route && route !== state.currentRoute;
  if ([LOCATION_CHANGE, Types.ACTION_STARTUP_DATA].includes(action.type) || routeLoaded) {
    dispatch(reconcileLocation(action.type === Types.ACTION_STARTUP_DATA ? action.devices : null));
  }
  return result;
};
