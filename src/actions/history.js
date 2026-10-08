import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { buildUrl, parseLocation } from '../url';
import { nextTimeline } from '../timeline/zoom';
import { canManageDevice } from '../utils';
import { checkRoutesData, loadDevice, selectTimeline } from './index';

function fallbackDongleId(devices) {
  const stored = window.localStorage.getItem('selectedDongleId');

  return devices?.some((d) => d.dongle_id === stored) ? stored : devices?.[0]?.dongle_id ?? null;
}

function canonicalUrl(location, state, devices) {
  const devicesLoaded = state.devices !== null;

  if (location.page === 'home') {
    const dongleId = devicesLoaded ? fallbackDongleId(devices) : null;

    return dongleId ? buildUrl({ page: 'dash', dongleId }) : state.router.location.pathname;
  }

  if (location.page === 'settings' && devicesLoaded) {
    const device = state.devices.find((d) => d.dongle_id === location.dongleId);

    if (!canManageDevice(device, state.profile)) {
      return buildUrl({ page: 'dash', dongleId: location.dongleId });
    }
  }

  return buildUrl(location);
}

export function syncLocation(devicesInApiOrder) {
  return (dispatch, getState) => {
    const state = getState();
    const deviceOrder = devicesInApiOrder ?? state.devices;
    const { pathname, search, hash } = state.router.location;
    const location = parseLocation(pathname);

    const url = canonicalUrl(location, state, deviceOrder);

    if (url !== pathname) {
      dispatch(replace({ pathname: url, search, hash }));

      return;
    }

    const logId = location.page === 'drive' ? location.logId : null;
    const start = logId ? location.start : null;
    const end = logId ? location.end : null;

    if (nextTimeline(state, logId, start, end)) {
      dispatch(selectTimeline(logId, start, end));
    }

    const dongleId = location.dongleId ?? state.dongleId ?? (state.devices ? fallbackDongleId(deviceOrder) : null);

    if (dongleId && dongleId !== state.dongleId) {
      dispatch(loadDevice(dongleId));
    }

    dispatch(checkRoutesData());
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action);

  if (action.type === LOCATION_CHANGE) {
    dispatch(syncLocation());
  }

  return result;
};
