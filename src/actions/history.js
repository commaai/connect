import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { PAGES, parseUrl, urlFor } from '../url';
import { checkRoutesData, selectRoute, setDevice } from './index';
import { api } from '../api/backend';

function reconcileUrl(url) {
  return (dispatch, getState) => {
    const { dongleId, router } = getState();
    if (url.page === PAGES.HOME && dongleId) {
      dispatch(replace({ ...router.location, pathname: urlFor({ dongleId }) }));
      return;
    }
    if (url.dongleId && url.dongleId !== dongleId) dispatch(setDevice(url.dongleId));
    dispatch(selectRoute(url.logId, url.zoom));
    dispatch(checkRoutesData());
  };
}

function resolveLegacyRange({ dongleId, legacyRange }, isCurrent) {
  return async (dispatch, getState) => {
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, legacyRange.start, legacyRange.end);
      if (!isCurrent() || !routes?.length) return;
      const logId = routes[0].fullname.split('|')[1];
      dispatch(replace({ ...getState().router.location, pathname: urlFor({ dongleId, logId }) }));
    } catch (error) {
      console.error('Error fetching routes data for log ID conversion', error);
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => {
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
    const url = parseUrl(pathname);
    dispatch(reconcileUrl(url));
    if (url.legacyRange) dispatch(resolveLegacyRange(url, () => revision === currentRevision));
    return result;
  };
};
