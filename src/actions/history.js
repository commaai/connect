import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, buildLocation, serializeRange } from '../url';
import { checkRoutesData, selectDevice, selectRoute } from './index';
import { api } from '../api/backend';
import * as Types from './types';

// Reconcile every history event after the router has stored the new location.
export function applyLocation(location, isCurrent = () => true) {
  return (dispatch, getState) => {
    const parsed = parseLocation(location);
    if (!parsed.ok) {
      const prefix = parseLocation({ pathname: `/${location.pathname.split('/')[1] || ''}` });
      const fallback = prefix.ok && prefix.state.page === 'dashboard'
        ? prefix.state : { page: 'home' };
      dispatch(replace(buildLocation({ ...fallback, search: location.search, hash: location.hash,
        modal: null, modalDevice: null, clip: null })));
      return;
    }
    const view = parsed.state;
    let state = getState();
    if (view.dongleId !== state.dongleId) {
      dispatch(selectDevice(view.dongleId, false, false));
      state = getState();
    }
    let zoom = view.zoom;
    const precise = location.state?.connectZoom;
    const enclosing = precise && serializeRange(precise.start, precise.end);
    if (view.page === 'drive' && enclosing && view.zoom?.start === enclosing.start * 1000
      && view.zoom?.end === enclosing.end * 1000) zoom = precise;
    dispatch(selectRoute(view.logId, zoom));
    if (state.primeNav !== (view.page === 'prime')) dispatch({
      type: Types.ACTION_PRIME_NAV, primeNav: view.page === 'prime',
    });
    if (state.streamNav !== (view.page === 'stream')) dispatch({
      type: Types.ACTION_STREAM_NAV, streamNav: view.page === 'stream',
    });
    if (['dashboard', 'drive'].includes(view.page)) dispatch(checkRoutesData());
    if (view.legacyRange) {
      const { start, end } = view.legacyRange;
      return api.routes.getRoutesSegments(view.dongleId, start, end).then((routes) => {
        if (!isCurrent() || !routes?.length) return;
        const logId = routes[0].fullname.split('|')[1];
        const current = parseLocation(getState().router.location);
        if (!current.ok || !current.state.legacyRange) return;
        dispatch(replace(buildLocation({ ...current.state, page: 'drive', logId, zoom: null, legacyRange: null })));
      }).catch((error) => console.error('Error resolving legacy drive link', error));
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => {
  let revision = 0;
  let previousPath;
  let previousZoom;
  let previousValid = false;
  return (next) => (action) => {
    if (!action) return;
    const result = next(action);
    if (action.type !== LOCATION_CHANGE) return result;
    const location = action.payload.location;

    // Search-only changes must not restart a legacy lookup. Its pending result
    // uses the latest query/hash, but leaving and revisiting gets a new guard.
    const valid = parseLocation(location).ok;
    if (location.pathname === previousPath && previousValid && valid) {
      const precise = location.state?.connectZoom;
      if (precise && (precise.start !== previousZoom?.start || precise.end !== previousZoom?.end)) {
        previousZoom = precise;
        dispatch(applyLocation(location));
      }
      return result;
    }
    previousPath = location.pathname;
    previousValid = valid;
    previousZoom = location.state?.connectZoom;
    revision += 1;
    const visit = revision;
    dispatch(applyLocation(location, () => revision === visit));
    return result;
  };
};
