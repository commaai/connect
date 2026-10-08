import { LOCATION_CHANGE, push, replace } from 'connected-react-router';
import { pagePath, parseLocation, selectPage } from '../url';
import { checkLastRoutesData, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export function navigate(change, { replace: useReplace = false } = {}) {
  return (dispatch, getState) => {
    const state = getState();
    const page = change.kind
      ? { ...change, dongleId: change.dongleId || state.dongleId, settings: null }
      : { ...selectPage(state), ...change };
    const { location } = state.router;
    const path = pagePath(page, location.search);
    if (path !== location.pathname + location.search) {
      dispatch((useReplace ? replace : push)(path));
    }
  };
}

function rangeMatches({ zoom, currentRoute }, range) {
  if (!range) {
    return !zoom || (zoom.start === 0 && zoom.end === currentRoute?.duration);
  }
  return zoom?.start === range.start && zoom?.end === range.end;
}

function resolveLegacyRange(page) {
  return (dispatch, getState) => {
    const { location } = getState().router;
    api.routes.getRoutesSegments(page.dongleId, page.start, page.end).then((routesData) => {
      if (!routesData?.length || getState().router.location !== location) {
        return;
      }
      const logId = routesData[0].fullname.split('|')[1];
      dispatch(navigate({ kind: 'drive', dongleId: page.dongleId, logId }, { replace: true }));
    }).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
    });
  };
}

export function applyPage(page, historyAction) {
  return (dispatch, getState) => {
    const state = getState();
    const deviceChanged = Boolean(page.dongleId) && page.dongleId !== state.dongleId;

    if (page.kind === 'legacyRange') {
      if (deviceChanged) {
        dispatch(selectDevice(page.dongleId));
        dispatch(checkLastRoutesData());
      }
      dispatch(resolveLegacyRange(page));
      return;
    }

    const logId = page.logId ?? null;
    const range = page.range ?? null;
    if (!deviceChanged && state.selectedRouteId === logId && rangeMatches(state, range)) {
      return;
    }

    if (deviceChanged) {
      dispatch(selectDevice(page.dongleId));
    }
    dispatch(pushTimelineRange(logId, range?.start ?? null, range?.end ?? null, historyAction === 'PUSH'));
    if (deviceChanged) {
      dispatch(checkLastRoutesData());
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return;
  }

  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyPage(parseLocation(action.payload.location), action.payload.action));
  }
  return result;
};
