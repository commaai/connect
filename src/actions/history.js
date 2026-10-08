import { LOCATION_CHANGE, push, replace } from 'connected-react-router';
import { buildUrl, parseUrl } from '../url';
import { selectDevice, selectTimelineRange } from './index';
import { api } from '../api/backend';

// The URL decides what is on screen. The UI never sets navigation state
// directly: it goes to a URL, and every location change (links, back/forward,
// the first page load) becomes state in applyLocation.

// Go to a page. Params default to the current device.
export function navigateTo(page, params = {}) {
  return (dispatch, getState) => {
    const { dongleId, router } = getState();
    const url = buildUrl({ page, dongleId, ...params });
    if (url !== router.location.pathname) {
      dispatch(push(url));
    }
  };
}

// Go to a drive, or a range of it. The whole drive gets the short URL.
export function navigateToDrive(logId, start = null, end = null) {
  return (dispatch, getState) => {
    const route = getState().routes?.find((r) => r.log_id === logId);
    const wholeDrive = start === 0 && end === route?.duration;
    dispatch(navigateTo('drive', wholeDrive ? { logId } : { logId, start, end }));
  };
}

// Old links point at a time window: find the drive in it and redirect there.
function openLegacyRange({ dongleId, from, to }) {
  return async (dispatch, getState) => {
    const requested = getState().router.location.pathname;
    try {
      const [route] = await api.routes.getRoutesSegments(dongleId, from, to) ?? [];
      if (route && getState().router.location.pathname === requested) {
        dispatch(replace(buildUrl({ page: 'drive', dongleId, logId: route.fullname.split('|')[1] })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}

// Make state match a location. Only what the location changes is touched, so
// loaded drives, playback and device connections survive navigation.
export function applyLocation(location) {
  return (dispatch, getState) => {
    if (!location) {
      return;
    }
    const { page, dongleId, logId = null, start = null, end = null } = location;

    if (dongleId && dongleId !== getState().dongleId) {
      dispatch(selectDevice(dongleId));
    }
    dispatch(selectTimelineRange(logId, start, end));

    if (page === 'legacy') {
      dispatch(openLegacyRange(location));
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  const result = next(action);
  if (action?.type === LOCATION_CHANGE) {
    dispatch(applyLocation(parseUrl(action.payload.location.pathname)));
  }
  return result;
};
