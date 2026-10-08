import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseUrl, serializeUrl } from '../routing/routes';
import { ROUTE_CHANGED } from '../routing/actions';
import { checkRoutesData, selectDevice } from './index';
import { api } from '../api/backend';

// All history actions use the same URL -> selection -> data pipeline.
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) return;
  const result = next(action);
  if (action.type !== LOCATION_CHANGE) return result;
  const location = action.payload.location;
  const route = parseUrl(location);
  if (route.dongleId && route.dongleId !== getState().dongleId) dispatch(selectDevice(route.dongleId, false, false));
  dispatch({ type: ROUTE_CHANGED, route });
  if (route.page !== 'not-found' && route.dongleId && getState().limit > 0) dispatch(checkRoutesData());
  if (route.legacyRange) {
    const { start, end } = route.legacyRange;
    api.routes.getRoutesSegments(route.dongleId, start, end).then((routes) => {
      if (getState().route !== route || !routes?.length) return;
      dispatch(replace(serializeUrl({ ...route, page: 'drive', routeId: routes[0].fullname.split('|')[1], legacyRange: null })));
    }).catch(console.error);
  } else if (route.page === 'drive') {
    const canonical = serializeUrl({ ...route, dialog: null });
    if (location.pathname !== canonical) dispatch(replace({ ...location, pathname: canonical }));
  }
  return result;
};
