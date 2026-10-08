import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, pathForNavigation } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';
import { hasRoutesData } from '../timeline/segments';

export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let revision = 0;
  let previousPathname;
  return (next) => (action) => {
    if (!action) return;
    if (action.type !== LOCATION_CHANGE) return next(action);

    // Publish the location first so nested actions read the new URL. Every
    // history action uses this same reconciliation, including programmatic PUSH.
    const state = getState();
    const result = next(action);
    const pathChanged = previousPathname !== action.payload.location.pathname;
    previousPathname = action.payload.location.pathname;
    if (pathChanged) revision += 1;
    const currentRevision = revision;
    const navigation = parseLocation(action.payload.location);
    const { dongleId, routeId, routeZoom, legacyZoom, page } = navigation;
    const deviceChanged = dongleId && dongleId !== state.dongleId;
    if (deviceChanged) dispatch(selectDevice(dongleId, false, false));

    // Home/referrals retain the last selected device and its fetched data.
    // Only the URL-owned view changes; modal/query changes leave playback alone.
    const current = getState();
    const route = current.routes?.find((candidate) => candidate.log_id === routeId);
    const zoom = routeId ? (routeZoom || (route ? { start: 0, end: route.duration } : null)) : null;
    const zoomMatches = routeZoom && current.zoom
      ? (current.zoom.start === routeZoom.start && current.zoom.end === routeZoom.end)
        || Math.floor(current.zoom.start / 1000) === routeZoom.start / 1000
        && Math.floor(current.zoom.end / 1000) === routeZoom.end / 1000
      : zoom?.start === current.zoom?.start && zoom?.end === current.zoom?.end;
    if (routeId !== current.selectedRouteId || !zoomMatches) {
      dispatch(pushTimelineRange(routeId, routeZoom?.start ?? null, routeZoom?.end ?? null, false, true));
    }
    if ((page === 'prime') !== getState().primeNav) dispatch(primeNav(page === 'prime', false));
    if ((page === 'stream') !== getState().streamNav) dispatch(streamNav(page === 'stream', false));
    if (deviceChanged || (routeId && !route) || (page === 'dashboard' && !hasRoutesData(current))) dispatch(checkRoutesData());

    if (legacyZoom && pathChanged) {
      api.routes.getRoutesSegments(dongleId, legacyZoom.start, legacyZoom.end).then((routes) => {
        // An older lookup must never navigate over a newer URL.
        if (revision !== currentRevision || !routes?.length) return;
        const logId = routes[0].fullname.split('|')[1];
        dispatch(replace({ ...(getState().router?.location || action.payload.location), pathname: pathForNavigation({ dongleId, routeId: logId }) }));
      }).catch((err) => console.error('Error fetching routes data for log ID conversion', err));
    }
    return result;
  };
};
