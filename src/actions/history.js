import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, driveUrl } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';
import * as Types from './types';

const revisions = new WeakMap();

function nextPathRevision(getState, pathname) {
  const previous = revisions.get(getState) || { pathname: null, revision: 0 };
  const revision = previous.pathname === pathname ? previous.revision : previous.revision + 1;
  revisions.set(getState, { pathname, revision });
  return revision;
}

function pathRevisionIsCurrent(getState, revision) {
  return revisions.get(getState)?.revision === revision;
}

export function applyLocation(location) {
  return async (dispatch, getState) => {
    const { pathname } = location;
    const view = parseLocation(location);
    const revision = nextPathRevision(getState, pathname);
    const state = getState();

    if (!view.valid) {
      dispatch({ type: Types.ACTION_URL_NOT_FOUND });
      return;
    }

    if (!view.dongleId) {
      if (state.selectedRouteId) {
        dispatch(pushTimelineRange(null, null, null, false));
      }
      if (state.primeNav) {
        dispatch(primeNav(false, false));
      }
      if (state.streamNav) {
        dispatch(streamNav(false, false));
      }
      return;
    }

    if (view.dongleId !== state.dongleId) {
      dispatch(selectDevice(view.dongleId, false, false));
    }

    if (view.page === 'legacy') {
      try {
        const routesData = await api.routes.getRoutesSegments(view.dongleId, view.legacyRange.start, view.legacyRange.end);
        if (!pathRevisionIsCurrent(getState, revision)) {
          return;
        }
        if (routesData && routesData.length > 0) {
          const logId = routesData[0].fullname.split('|')[1];
          dispatch(replace(driveUrl(view.dongleId, logId)));
        } else {
          dispatch({ type: Types.ACTION_URL_NOT_FOUND });
        }
      } catch (err) {
        console.error('Error fetching routes data for log ID conversion', err);
        if (pathRevisionIsCurrent(getState, revision)) {
          dispatch({ type: Types.ACTION_URL_NOT_FOUND });
        }
      }
      return;
    }

    const selected = getState();
    if (view.page === 'drive') {
      if (selected.primeNav) {
        dispatch(primeNav(false, false));
      }
      if (selected.streamNav) {
        dispatch(streamNav(false, false));
      }
      const start = view.range?.start ?? null;
      const end = view.range?.end ?? null;
      if (selected.selectedRouteId !== view.logId || selected.zoom?.start !== start || selected.zoom?.end !== end) {
        dispatch(pushTimelineRange(view.logId, start, end, false));
      }
      dispatch(checkRoutesData());
      return;
    }

    if (selected.selectedRouteId) {
      dispatch(pushTimelineRange(null, null, null, false));
    }

    const wantsPrime = view.page === 'prime';
    if (wantsPrime !== selected.primeNav) {
      dispatch(primeNav(wantsPrime, false));
    }

    const wantsStream = view.page === 'stream';
    if (wantsStream !== selected.streamNav) {
      dispatch(streamNav(wantsStream, false));
    }

    if (view.page === 'dashboard' && view.dongleId !== state.dongleId) {
      dispatch(checkRoutesData());
    }
  };
}

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyLocation(action.payload.location));
  }
  return result;
};
