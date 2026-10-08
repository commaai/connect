import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { parseLocation } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import * as Types from './types';
import {
  checkLastRoutesData,
  checkRoutesData,
  fetchDeviceOnline,
  fetchSharedDevice,
  primeFetchSubscription,
  resolveLegacyRange,
} from './index';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (action?.type !== LOCATION_CHANGE) return next(action);

  const before = getState();
  next(action);

  const location = action.payload.location;
  const destination = parseLocation(location);
  dispatch({ type: Types.ACTION_SYNC_URL, destination });
  const state = getState();

  if (destination.canonicalPath && destination.page !== 'legacy') {
    dispatch(replace(destination.canonicalPath));
    return;
  }
  if (!state.startupComplete) return;

  if (before.dongleId !== state.dongleId) {
    if (before.dongleId) webrtcConnectionManager.disconnect();
    if (state.dongleId) {
      window.localStorage.setItem('selectedDongleId', state.dongleId);
      const device = state.devices?.find((candidate) => candidate.dongle_id === state.dongleId) || state.device;
      if (device && (!device.shared || state.profile?.superuser)) {
        dispatch(primeFetchSubscription(state.dongleId, device));
        dispatch(fetchDeviceOnline(state.dongleId));
      } else {
        dispatch(fetchSharedDevice(state.dongleId));
      }
    }
  }

  if (destination.page === 'legacy') {
    dispatch(resolveLegacyRange(destination.dongleId, destination.range.start, destination.range.end));
    return;
  }

  if (destination.page === 'drive') {
    dispatch(checkRoutesData());
  } else if (state.dongleId && (before.dongleId !== state.dongleId
      || before.filter.start !== state.filter.start
      || before.filter.end !== state.filter.end
      || !state.routes)) {
    dispatch(checkLastRoutesData());
  }
};
