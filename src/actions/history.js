import { LOCATION_CHANGE, goBack, push, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { Page, parseLocation, selectLocation, urlFor } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import { checkRoutesData, fetchDrive, loadDevice } from './index';
import { loadAccount } from './startup';

// Navigating means changing the URL. reducers/location.js turns every new URL into state, then
// this loads whatever the new page needs that isn't loaded yet.
const loadLocation = (previous) => async (dispatch, getState) => {
  const state = getState();
  const { location } = state.router;
  const { page, dongleId, range, dialog } = parseLocation(location);
  const authenticated = api.auth.isAuthenticated();

  // signed out, only public drives can be shown, everything else shows the login page
  if (page === Page.AUTH || (!authenticated && page !== Page.DRIVE)) {
    return;
  }
  if (authenticated) {
    dispatch(loadAccount());
  }

  if (page === Page.HOME) {
    const redirect = new URLSearchParams(location.search).get('r');
    if (redirect) {
      dispatch(replace(redirect));
      return;
    }

    // the last selected device, or the first one the API lists
    const { devices } = await dispatch(loadAccount());
    const remembered = window.localStorage.getItem('selectedDongleId');
    const device = devices.find((d) => d.dongle_id === remembered) || devices[0];
    if (device && getState().router.location === location) {
      dispatch(replace(urlFor({ page: Page.DASHBOARD, dongleId: device.dongle_id, dialog })));
    }
    return;
  }

  if (state.dongleId !== previous.dongleId) {
    if (previous.dongleId) {
      webrtcConnectionManager.disconnect();
    }
    dispatch(loadDevice(state.dongleId));
  }
  if (state.currentRouteLoading && state.selectedRouteId !== previous.selectedRouteId) {
    dispatch(fetchDrive(state.dongleId, state.selectedRouteId));
  }
  if (page === Page.DASHBOARD || page === Page.LEGACY) {
    dispatch(checkRoutesData());
  }

  // old links point to a time range, find the drive that starts in it
  if (page === Page.LEGACY) {
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, range.start, range.end);
      const route = routes?.[0];
      if (route && getState().router.location === location) {
        dispatch(replace(urlFor({ page: Page.DRIVE, dongleId, logId: route.fullname.split('|')[1] })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  }
};

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }
  const previous = getState();
  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(loadLocation(previous));
  }
  return result;
};

// Dialogs show on top of a page, the current one unless `page` says otherwise. Closing a dialog
// returns to where it was opened from, or to the page under it when it was opened from a link.
export function openDialog(dialog, page = {}) {
  return (dispatch, getState) => {
    dispatch(push(urlFor({ ...selectLocation(getState()), ...page, dialog }), { openedInApp: true }));
  };
}

export function closeDialog() {
  return (dispatch, getState) => {
    if (getState().router.location.state?.openedInApp) {
      dispatch(goBack());
    } else {
      dispatch(replace(urlFor({ ...selectLocation(getState()), dialog: null })));
    }
  };
}
