import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, buildLocation } from '../url';
import { checkRoutesData, checkLastRoutesData, loadDevice, applyTimelineRange } from './index';
import { ACTION_NAVIGATION } from './types';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let legacyRequest = null;
  return next => action => {
    const before = getState();
    const result = next(action);
    if (action.type !== LOCATION_CHANGE) return result;

    const location = action.payload.location;
    const navigation = parseLocation(location);
    const deviceChanged = navigation.dongleId && navigation.dongleId !== before.dongleId;
    if (deviceChanged) dispatch(loadDevice(navigation.dongleId));
    dispatch({ type: ACTION_NAVIGATION, navigation });

    const rangeChanged = navigation.zoom?.start !== before.navigation?.zoom?.start
      || navigation.zoom?.end !== before.navigation?.zoom?.end;
    const driveChanged = deviceChanged || navigation.selectedRouteId !== before.selectedRouteId;
    if (driveChanged || rangeChanged) {
      dispatch(applyTimelineRange(navigation.selectedRouteId, navigation.zoom?.start, navigation.zoom?.end, location.state?.previousZoom));
    }
    if (deviceChanged) dispatch(checkLastRoutesData());
    else if (driveChanged) dispatch(checkRoutesData());

    if (!navigation.legacyZoom) legacyRequest = null;
    else if (legacyRequest?.pathname !== location.pathname) {
      const request = { pathname: location.pathname };
      legacyRequest = request;
      const { start, end } = navigation.legacyZoom;
      api.routes.getRoutesSegments(navigation.dongleId, start, end).then(routes => {
        // A lookup for an old link must not take the user away from a newer view.
        if (!routes?.length || legacyRequest !== request) return;
        const current = getState().router.location;
        dispatch(replace(buildLocation({ ...parseLocation(current), selectedRouteId: routes[0].fullname.split('|')[1], legacyZoom: null }, current.search)));
      }).catch(err => console.error('Error fetching routes data for log ID conversion', err));
    }
    return result;
  };
};
