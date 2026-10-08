import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseURL, buildURL } from '../url';
import { checkRoutesData, selectDevice, pushTimelineRange } from './index';
import { ACTION_APPLY_DESTINATION } from './types';
import { api } from '../api/backend';

export const syncStateFromURL = (pathname) => async (dispatch, getState) => {
  const state = getState();
  const parsed = parseURL(pathname);
  const destination = { ...parsed, dongleId: parsed.dongleId ?? state.dongleId };
  const { page, dongleId, logId, range } = destination;
  const deviceChanged = state.dongleId !== dongleId;
  const isCurrent = () => getState().router.location.pathname === pathname;

  if (deviceChanged) dispatch(selectDevice(dongleId, false, false));

  dispatch({
    type: ACTION_APPLY_DESTINATION,
    destination,
  });

  const isDrive = page === 'drive';
  if (deviceChanged || isDrive || state.selectedRouteId) {
    const routeId = isDrive ? logId : null;
    const zoom = isDrive ? range : null;
    dispatch(pushTimelineRange(routeId, zoom?.start ?? null, zoom?.end ?? null, false));
  }

  if (dongleId && (deviceChanged || isDrive)) {
    dispatch(checkRoutesData());
  }

  if (page === 'legacy-drive') {
    try {
      const routesData = await api.routes.getRoutesSegments(dongleId, range.start, range.end);
      if (!isCurrent()) return;

      const logId = routesData?.[0]?.fullname?.split('|')[1];
      if (logId) dispatch(replace(buildURL({ page: 'drive', dongleId, logId, range: null })));
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  }
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) return;

  next(action); // must be first, otherwise breaks history

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    dispatch(syncStateFromURL(action.payload.location.pathname));
  }
};
