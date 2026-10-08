import { LOCATION_CHANGE } from 'connected-react-router';

import { api } from '../api/backend';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { webrtcConnectionManager } from '../utils/webrtc';
import { checkRoutesData, fetchDeviceOnline, primeFetchSubscription } from './index';
import { navigate } from './navigation';

const ROUTE_PAGES = ['dashboard', 'drive'];

function zoomChanged(a, b) {
  return a?.start !== b?.start || a?.end !== b?.end;
}

function loopMatchesZoom(loop, zoom) {
  return loop?.startTime === zoom.start && loop.duration === zoom.end - zoom.start;
}

function switchDevice(state, dispatch) {
  const { dongleId, device, profile } = state;
  // tear down existing webrtc connection
  webrtcConnectionManager.disconnect();
  if ((device && !device.shared) || profile?.superuser) {
    dispatch(primeFetchSubscription(dongleId, device));
    dispatch(fetchDeviceOnline(dongleId));
  }
}

function resolveLegacyRange(nav, dispatch, getState) {
  const { start, end } = nav.legacyRange;
  api.routes.getRoutesSegments(nav.dongleId, start, end).then((routes) => {
    if (routes?.length && getState().nav === nav) {
      const logId = routes[0].fullname.split('|')[1];
      dispatch(navigate({ page: 'drive', dongleId: nav.dongleId, logId }, { replace: true }));
    }
  }).catch((err) => {
    console.error('Error fetching routes data for log ID conversion', err);
  });
}

function syncNavigation(prev, dispatch, getState) {
  const state = getState();
  const { nav, dongleId, zoom } = state;

  if (nav.dongleId) {
    window.localStorage.setItem('selectedDongleId', nav.dongleId);
  }

  if (prev.dongleId && dongleId !== prev.dongleId) {
    switchDevice(state, dispatch);
  }

  if (nav.page === 'home' && dongleId) {
    dispatch(navigate({ page: 'dashboard', dongleId, modal: nav.modal }, { replace: true }));
    return;
  }

  if (nav.legacyRange) {
    resolveLegacyRange(nav, dispatch, getState);
    return;
  }

  if (ROUTE_PAGES.includes(nav.page) && (api.auth.isAuthenticated() || nav.page === 'drive')) {
    dispatch(checkRoutesData());
  }

  const driveChanged = nav.page === 'drive' && (nav.logId !== prev.nav.logId || dongleId !== prev.dongleId);
  if (driveChanged || (zoom && zoomChanged(prev.zoom, zoom) && !loopMatchesZoom(state.loop, zoom))) {
    dispatch(resetPlayback());
    if (zoom) dispatch(selectLoop(zoom.start, zoom.end));
  }
}

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (action.type !== LOCATION_CHANGE) {
    return next(action);
  }
  const prev = getState();
  const result = next(action); // must be first, otherwise breaks history
  syncNavigation(prev, dispatch, getState);
  return result;
};
