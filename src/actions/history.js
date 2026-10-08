import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { driveUrl } from '../url';
import { checkRoutesData, checkLastRoutesData, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice } from './index';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';

export function loadDevice() {
  return (dispatch, getState) => {
    const { dongleId, device, profile } = getState();
    if (!dongleId) return;
    window.localStorage.setItem('selectedDongleId', dongleId);
    if (device && (device.is_owner || profile?.superuser)) {
      dispatch(primeFetchSubscription(dongleId, device, profile));
      dispatch(fetchDeviceOnline(dongleId));
    } else {
      dispatch(fetchSharedDevice(dongleId));
    }
  };
}

// Navigation has already been reduced when effects run. Effects never select routes in Redux.
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  const previous = getState();
  const result = next(action);
  if (action.type !== LOCATION_CHANGE) return result;

  const state = getState();
  const { navigation, dongleId } = state;
  if (previous.dongleId !== dongleId) {
    if (previous.dongleId) webrtcConnectionManager.disconnect();
    dispatch(loadDevice());
  }
  if (previous.dongleId !== dongleId || previous.navigation.routeId !== navigation.routeId) {
    dispatch(state.limit === 0 ? checkLastRoutesData() : checkRoutesData());
  }

  if (navigation.legacyRange) {
    const location = state.router.location;
    const { start, end } = navigation.legacyRange;
    api.routes.getRoutesSegments(dongleId, start, end).then((routes) => {
      // Never let a slow legacy lookup redirect a later navigation.
      if (getState().router.location !== location || !routes?.length) return;
      dispatch(replace({
        ...location,
        pathname: driveUrl(dongleId, routes[0].fullname.split('|')[1]),
      }));
    }).catch((err) => console.error('Error fetching routes data for log ID conversion', err));
  }
  return result;
};
