import { LOCATION_CHANGE, goBack, push, replace } from 'connected-react-router';
import { parseLocation, buildLocation, selectLocation, parseRedirect } from '../url';
import { checkRoutesData, loadDevice } from './index';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';

export const syncLocation = (previous = {}) => async (dispatch, getState) => {
  const state = getState();
  const location = state.router.location;
  const destination = parseLocation(location);
  const { page, dongleId, range } = destination;
  if (page === 'auth' || (!api.auth.isAuthenticated() && !['drive', 'legacy'].includes(page))) return;

  const redirect = parseRedirect(new URLSearchParams(location.search).get('r'));
  if (redirect) {
    dispatch(replace(redirect));
    return;
  }
  if (['home', 'unknown'].includes(page)) {
    if (!state.devices) return;
    const remembered = window.localStorage.getItem('selectedDongleId');
    const device = state.devices.find((candidate) => candidate.dongle_id === (state.dongleId || remembered)) || state.devices[0];
    if (device) dispatch(replace(buildLocation({ ...destination, page: 'dashboard', dongleId: device.dongle_id }, location)));
    return;
  }
  if (state.dongleId !== previous.dongleId) {
    if (previous.dongleId) webrtcConnectionManager.disconnect();
    dispatch(loadDevice(state.dongleId));
  }
  if (['dashboard', 'drive'].includes(page)) dispatch(checkRoutesData());
  if (page === 'legacy') {
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, range.start, range.end);
      if (routes?.length && getState().router.location === location) {
        dispatch(replace(buildLocation({ ...destination, page: 'drive', routeId: routes[0].fullname.split('|')[1], range: null }, location)));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  }
};

// The router publishes the location before loading data for its atomic selection change.
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) return;
  const previous = getState();
  const result = next(action);
  if (action.type === LOCATION_CHANGE) dispatch(syncLocation(previous));
  return result;
};

export function openDialog(dialog, params = {}) {
  return (dispatch, getState) => {
    const state = getState();
    const location = buildLocation({ ...selectLocation(state), ...params, dialog }, state.router.location);
    dispatch(push({ ...location, state: { dialogParent: true } }));
  };
}

export function closeDialog() {
  return (dispatch, getState) => {
    const state = getState();
    const { location } = state.router;
    const destination = selectLocation(state);
    if (location.state?.dialogParent) dispatch(goBack());
    else dispatch(replace(buildLocation({ ...destination, dialog: destination.parent, parent: null, clip: null }, location)));
  };
}
