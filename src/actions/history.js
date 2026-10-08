import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { PAGES, parseUrl, urlFor } from '../url';
import { checkRoutesData, selectRoute, setDevice } from './index';
import { api } from '../api/backend';

// One reconciliation path for initial load, PUSH, POP, and REPLACE.
// Data and playback are retained unless their device or drive selection changes.
export function syncStateFromUrl(pathname) {
  return (dispatch, getState) => {
    const url = parseUrl(pathname);
    if (url.page === PAGES.HOME && getState().dongleId) {
      dispatch(replace({ ...getState().router.location, pathname: urlFor({ dongleId: getState().dongleId }) }));
      return;
    }
    if (url.dongleId && url.dongleId !== getState().dongleId) dispatch(setDevice(url.dongleId));
    dispatch(selectRoute(url.logId, url.zoom));
    dispatch(checkRoutesData());
  };
}

export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let previousPathname;
  let revision = 0;
  return (next) => (action) => {
    const result = next(action);
    if (action.type !== LOCATION_CHANGE) return result;
    const { pathname } = action.payload.location;
    // Dialog-only changes cannot reset playback or start duplicate lookups.
    if (pathname === previousPathname) return result;
    previousPathname = pathname;
    revision += 1;
    const currentRevision = revision;
    dispatch(syncStateFromUrl(pathname));
    const { dongleId, legacyRange } = parseUrl(pathname);
    if (legacyRange) {
      api.routes.getRoutesSegments(dongleId, legacyRange.start, legacyRange.end).then((routes) => {
        if (revision !== currentRevision || !routes?.length) return;
        const logId = routes[0].fullname.split('|')[1];
        dispatch(replace({ ...getState().router.location, pathname: urlFor({ dongleId, logId }) }));
      }).catch((err) => console.error('Error fetching routes data for log ID conversion', err));
    }
    return result;
  };
};
