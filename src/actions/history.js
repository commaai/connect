import { LOCATION_CHANGE, replace } from 'connected-react-router';
import * as Types from './types';
import { parseRoute } from '../url';
import { checkLastRoutesData, checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange, popTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let lastReconciledKey = null;
  let activePathname = null;

  return (next) => async (action) => {
    if (!action) return;
    if (action.type !== LOCATION_CHANGE) return next(action);

    const { location } = action.payload;
    const locationKey = `${location.pathname}${location.search || ''}`;
    const isDuplicate = locationKey === lastReconciledKey;
    lastReconciledKey = locationKey;
    activePathname = location.pathname;
    const state = getState();
    const path = parseRoute(locationKey);
    next(action);

    if ((state.routeModal ?? null) !== path.modal || (state.routeModalDeviceId ?? null) !== path.modalDeviceId
      || (state.routeModalClip ?? null) !== path.routeModalClip) {
      dispatch({ type: Types.ACTION_ROUTE_MODAL, modal: path.modal, deviceId: path.modalDeviceId, clip: path.routeModalClip });
    }

    if (isDuplicate) return;

    if (state.router?.location?.pathname === location.pathname
      && (state.router?.location?.search || '') !== (location.search || '')) return;

    if (path.dongleId && path.dongleId !== state.dongleId) {
      dispatch(selectDevice(path.dongleId, false, false));
    }

    if (path.legacyRange) {
      const { start, end } = path.legacyRange;
      api.routes.getRoutesSegments(path.dongleId, start, end).then((routesData) => {
        if (activePathname !== location.pathname || !routesData?.length) return;
        const logId = routesData[0].fullname.split('|')[1];
        const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;
        if (!logId || !Number.isFinite(duration) || duration <= 0) return;
        const routePath = `/${path.dongleId}/${logId}`;
        if (parseRoute(routePath).routeId !== logId) return;
        const latestLocation = getState().router?.location || location;
        dispatch(replace(`${routePath}${latestLocation.search || ''}${latestLocation.hash || ''}`));
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    } else if (path.routeId || state.selectedRouteId) {
      const currentRoute = state.routes?.find((route) => route.log_id === state.selectedRouteId);
      const previous = state.zoom?.previous;
      const targetStart = path.zoom?.start ?? 0;
      const targetEnd = path.zoom?.end ?? currentRoute?.duration;
      const returningToPrevious = path.routeId === state.selectedRouteId && previous
        && targetStart === previous.start && targetEnd === previous.end;
      if (returningToPrevious) dispatch(popTimelineRange(path.routeId, false));
      else dispatch(pushTimelineRange(path.routeId, path.zoom?.start ?? null, path.zoom?.end ?? null, false));
    }

    const deviceChanged = path.dongleId && path.dongleId !== state.dongleId;
    const missingSelectedRoute = path.routeId && !state.routes?.some((route) => route.log_id === path.routeId);
    if (deviceChanged) {
      dispatch(checkLastRoutesData());
    } else if (missingSelectedRoute) {
      dispatch(checkRoutesData());
    }

    const prime = path.page === 'prime';
    if (prime !== state.primeNav) dispatch(primeNav(prime, false));

    const stream = path.page === 'stream';
    if (stream !== state.streamNav) dispatch(streamNav(stream, false));
  };
};
