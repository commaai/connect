import { LOCATION_CHANGE, replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';

import { parseUrl, urlFor } from '../url';
import { fetchDeviceData, selectDevice, selectRoute } from './index';
import * as Types from './types';
import { api } from '../api/backend';

function sameRange(a, b) {
  return a?.start === b?.start && a?.end === b?.end;
}

// Legacy links name a time range instead of a drive. Look up the drive that
// starts in it and show that instead.
function openLegacyRange(dongleId, { start, end }) {
  return async (dispatch) => {
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, start, end);
      if (routes?.length) {
        const logId = routes[0].fullname.split('|')[1];
        dispatch(replace(urlFor({ dongleId, logId })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
      Sentry.captureException(err, { fingerprint: 'history_legacy_range' });
    }
  };
}

// Apply a URL to the state. Only what differs from the current state is
// touched, so moving between pages keeps the loaded device, drives and
// playback whenever they still apply.
export function applyUrl(pathname) {
  return (dispatch, getState) => {
    const url = parseUrl(pathname);

    // pages without a device (e.g. referrals) keep the last selected one
    const deviceChanged = Boolean(url.dongleId) && url.dongleId !== getState().dongleId;
    if (deviceChanged) {
      dispatch(selectDevice(url.dongleId));
    }

    const state = getState();
    const selectedRoute = state.routes?.find((route) => route.log_id === url.logId);
    const zoom = url.zoom || (selectedRoute ? { start: 0, end: selectedRoute.duration } : null);
    if (deviceChanged || url.logId !== state.selectedRouteId || !sameRange(zoom, state.zoom)) {
      dispatch(selectRoute(url.logId, url.zoom));
    }

    if (url.page !== state.page) {
      dispatch({ type: Types.ACTION_SELECT_PAGE, page: url.page });
    }

    if (deviceChanged) {
      dispatch(fetchDeviceData());
    }

    if (url.legacyRange) {
      dispatch(openLegacyRange(url.dongleId, url.legacyRange));
    }
  };
}

// The URL is the source of truth for what is on screen. Every location
// change, whether a link, push, replace or back/forward, goes through applyUrl.
export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyUrl(action.payload.location.pathname));
  }
  return result;
};
