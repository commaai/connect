import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { buildUrl, parseUrl } from '../url';
import { checkLastRoutesData, selectDevice, selectTimeline } from './index';
import { api } from '../api/backend';

// URL -> state, after every location change: cold loads, links, back and
// forward. Each step only acts on what differs from the current state, so
// opening a dialog or revisiting a page reuses what is already loaded.
export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  const result = next(action);
  if (action?.type === LOCATION_CHANGE) {
    dispatch(applyUrl(parseUrl(action.payload.location)));
  }
  return result;
};

function applyUrl(nav) {
  return (dispatch, getState) => {
    const deviceChanged = Boolean(nav.dongleId) && nav.dongleId !== getState().dongleId;
    if (deviceChanged) {
      dispatch(selectDevice(nav.dongleId));
    }

    dispatch(selectTimeline(nav.logId, nav.page === 'drive' ? nav.range : null));

    if (deviceChanged) {
      dispatch(checkLastRoutesData());
    }
    if (nav.page === 'legacy') {
      dispatch(replaceLegacyLink(nav));
    }
  };
}

// Old links carry a unix ms range instead of a drive; swap in the drive it
// points at, unless the user has moved on by the time the lookup returns.
function replaceLegacyLink({ dongleId, range }) {
  return async (dispatch, getState) => {
    const legacyPath = getState().router.location.pathname;
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, range.start, range.end);
      if (routes?.length && getState().router.location.pathname === legacyPath) {
        const logId = routes[0].fullname.split('|')[1];
        dispatch(replace(buildUrl({ page: 'drive', dongleId, logId })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}
