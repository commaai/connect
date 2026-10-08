import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, urlFor } from '../url';
import { checkRoutesData, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice } from './index';
import * as Types from './types';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { webrtcConnectionManager } from '../utils/webrtc';
import { api } from '../api/backend';

export function syncLocation(defaultDongleId) {
  return (dispatch, getState) => {
    const state = getState();
    const location = state.router.location;
    const { page, dongleId: pathDevice, logId, zoom, legacy } = parseLocation(location);
    if (!state.devices || page === 'auth') return;

    if (['home', 'demo', 'not-found'].includes(page)) {
      const remembered = localStorage.getItem('selectedDongleId');
      const dongleId = pathDevice || state.devices.find((device) => device.dongle_id === remembered)?.dongle_id
        || defaultDongleId || state.devices[0]?.dongle_id;
      if (dongleId) return dispatch(replace({ ...location, pathname: urlFor({ dongleId }) }));
    }

    const dongleId = pathDevice || state.dongleId;
    if (dongleId !== state.dongleId) {
      webrtcConnectionManager.disconnect();
      dispatch({ type: Types.ACTION_SELECT_DEVICE, dongleId });
      const device = getState().device;
      if (device?.is_owner || state.profile?.superuser) {
        dispatch(primeFetchSubscription(dongleId, device));
        dispatch(fetchDeviceOnline(dongleId));
      } else if (dongleId && !device) {
        dispatch(fetchSharedDevice(dongleId));
      }
    }

    const current = getState();
    const route = current.routes?.find((candidate) => candidate.log_id === logId) || current.routeCache[logId];
    const start = zoom?.start ?? (route ? 0 : null);
    const end = zoom?.end ?? route?.duration ?? null;
    if (current.selectedRouteId !== logId || current.zoom?.start !== (start ?? undefined)
      || current.zoom?.end !== (end ?? undefined)) {
      dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: logId, start, end });
      dispatch(resetPlayback());
      dispatch(selectLoop(start, end));
    }

    if (legacy) {
      return api.routes.getRoutesSegments(dongleId, legacy.start, legacy.end).then((routes) => {
        if (getState().router.location !== location || !routes?.length) return;
        dispatch(replace({ ...location, pathname: urlFor({ dongleId, logId: routes[0].fullname.split('|')[1] }) }));
      }).catch((err) => console.error('Error fetching routes data for log ID conversion', err));
    }

    if (dongleId && ['dashboard', 'drive'].includes(page)) {
      if (!getState().limit) dispatch({ type: Types.ACTION_UPDATE_ROUTE_LIMIT, limit: 5 });
      return dispatch(checkRoutesData());
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  const result = next(action);
  if (action.type === LOCATION_CHANGE) dispatch(syncLocation());
  return result;
};
