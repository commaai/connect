import { LOCATION_CHANGE, push, replace } from 'connected-react-router';
import { destinationFromUrl, urlForDestination } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';
import * as Types from './types';

export const openSettings = (dongleId) => push(urlForDestination({ dongleId, kind: 'settings' }));
export const closeSettings = (dongleId) => push(urlForDestination({ dongleId, kind: 'dashboard' }));

const setSettings = (dispatch, dongleId) => dispatch({ type: Types.ACTION_SETTINGS_NAV, dongleId });

// URL -> state has one entrance. It intentionally runs after LOCATION_CHANGE,
// including PUSH, POP and REPLACE, so browser navigation and in-app navigation
// share the exact same code path.
export const syncStateFromUrl = (pathname) => async (dispatch, getState) => {
  const destination = destinationFromUrl(pathname);
  const isCurrent = () => window.location.pathname === pathname;

  if (destination.kind === 'not-found' || destination.kind === 'root') {
    setSettings(dispatch, null);
    return;
  }

  if (destination.kind === 'legacy-range') {
    try {
      const routes = await api.routes.getRoutesSegments(destination.dongleId, destination.range.start, destination.range.end);
      if (!isCurrent()) return;
      const logId = routes?.[0]?.fullname?.split('|')[1];
      if (logId) dispatch(replace(urlForDestination({ dongleId: destination.dongleId, kind: 'drive', logId })));
    } catch (err) {
      console.error('Unable to resolve legacy route URL', err);
    }
    return;
  }

  const previous = getState();
  const deviceChanged = previous.dongleId !== destination.dongleId;
  if (deviceChanged) dispatch(selectDevice(destination.dongleId, false, false));

  const state = getState();
  const routeChanged = destination.kind === 'drive'
    && (state.selectedRouteId !== destination.logId
      || state.zoom?.start !== destination.range?.start
      || state.zoom?.end !== destination.range?.end);

  setSettings(dispatch, destination.kind === 'settings' ? destination.dongleId : null);
  dispatch(primeNav(destination.kind === 'prime', false));
  dispatch(streamNav(destination.kind === 'stream', false));

  if (destination.kind === 'drive') {
    dispatch(pushTimelineRange(destination.logId, destination.range?.start ?? null, destination.range?.end ?? null, false));
  } else if (state.selectedRouteId || state.zoom) {
    dispatch(pushTimelineRange(null, null, null, false));
  }

  // Route metadata is durable Redux state: only fetch when the destination can
  // actually require new data, never simply because a URL event was emitted.
  if (deviceChanged || routeChanged) dispatch(checkRoutesData());
};

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) return undefined;
  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(syncStateFromUrl(action.payload.location.pathname));
  }
  return result;
};
