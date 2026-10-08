import { LOCATION_CHANGE } from 'connected-react-router';

import { Page, overlayStateForView, parsePath, routeIdFromFullname, zoomToKeep } from '../url';
import { api } from '../api/backend';
import * as Types from './types';
import {
  checkLastRoutesData,
  checkRoutesData,
  commitTimeline,
  loadDevice,
  pushTimelineRange,
} from './index';

export const LEGACY_LOOKUP_ERROR = 'Error fetching routes data for log ID conversion';

function applyView(view) {
  return (dispatch, getState) => {
    const dongleChanged = Boolean(view.dongleId) && view.dongleId !== getState().dongleId;
    if (dongleChanged) dispatch(loadDevice(view.dongleId));

    const state = getState();
    const overlay = overlayStateForView(view);
    if (overlay.primeNav !== state.primeNav) {
      dispatch({ type: Types.ACTION_PRIME_NAV, primeNav: overlay.primeNav });
    }
    if (overlay.streamNav !== state.streamNav) {
      dispatch({ type: Types.ACTION_STREAM_NAV, streamNav: overlay.streamNav });
    }
    if (overlay.settingsNav !== state.settingsNav) {
      dispatch({ type: Types.ACTION_SETTINGS_NAV, settingsNav: overlay.settingsNav });
    }

    if (view.name === Page.drive) {
      const stateZoom = state.selectedRouteId === view.routeId ? state.zoom : null;
      const zoom = zoomToKeep(view.zoom, stateZoom);
      dispatch(commitTimeline(view.routeId, zoom?.start ?? null, zoom?.end ?? null));
    } else {
      dispatch(commitTimeline(null, null, null));
    }

    if (!dongleChanged) return;
    if (view.name === Page.drive) dispatch(checkRoutesData());
    else dispatch(checkLastRoutesData());
  };
}

export function applyLocation(pathname) {
  return (dispatch, getState) => {
    const view = parsePath(pathname);

    // Device-less pages (home, referrals) keep the current device in state so
    // going back to a device view does not refetch it.
    if (!view.dongleId) {
      dispatch(applyView({ name: Page.device, dongleId: getState().dongleId }));
      return;
    }

    if (view.name === Page.legacy) {
      dispatch(applyView({ name: Page.device, dongleId: view.dongleId }));
      api.routes.getRoutesSegments(view.dongleId, view.legacy.start, view.legacy.end).then((routesData) => {
        // The lookup is async; the user may have navigated away while it ran.
        if (getState().router?.location?.pathname != null
          && getState().router.location.pathname !== pathname) return;
        if (routesData && routesData.length > 0) {
          // Rewrites history so back does not land on the legacy URL again.
          const logId = routeIdFromFullname(routesData[0].fullname);
          dispatch(pushTimelineRange(logId, null, null, { replace: true }));
        }
      }).catch((err) => {
        console.error(LEGACY_LOOKUP_ERROR, err);
      });
      return;
    }

    dispatch(applyView(view));
  };
}

// next(action) runs first so the router state is current. Programmatic pushes
// (pushTimelineRange, selectDevice) re-enter here; commitTimeline/timelineAgrees
// makes them a no-op instead of a loop.
export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) return;

  next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyLocation(action.payload.location.pathname));
  }
};
