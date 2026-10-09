import { LOCATION_CHANGE, goBack, push, replace } from 'connected-react-router';
import { parseLocation, toPath } from '../url';
import * as Types from './types';
import { selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

// The whole drive has no range in its URL.
function isWholeDrive(range, route) {
  return range.start === 0 && range.end === route?.duration;
}

// Navigate to a location on the selected device, e.g. navigate({ page: 'prime' }).
// The middleware below applies the new URL to state.
export function navigate(location, { replace: replaceEntry = false } = {}) {
  return (dispatch, getState) => {
    const state = getState();
    const target = { dongleId: state.dongleId, ...location };

    const route = state.currentRoute;
    if (target.range && route?.log_id === target.routeId && isWholeDrive(target.range, route)) {
      target.range = null;
    }

    const url = toPath(target);
    const { pathname, search } = state.router.location;
    if (url !== pathname + search) {
      dispatch(replaceEntry ? replace(url) : push(url));
    }
  };
}

// Open a dialog over the current page.
export function openModal(modal) {
  return (dispatch, getState) => {
    const { pathname, search } = getState().router.location;
    dispatch(push(toPath({ ...parseLocation(pathname, search), modal }), { openedInApp: true }));
  };
}

// Close the dialog. One opened in the app is closed with back, so the close
// button and the browser's back button agree. One opened from a link is removed in place.
export function closeModal() {
  return (dispatch, getState) => {
    const { pathname, search, state } = getState().router.location;
    if (state?.openedInApp) {
      dispatch(goBack());
    } else {
      dispatch(replace(toPath({ ...parseLocation(pathname, search), modal: null })));
    }
  };
}

// The URL decides what is on screen. Every location change, including the
// initial one, is parsed and applied to state here, and nowhere else.
export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return;
  }

  const result = next(action);

  if (action.type === LOCATION_CHANGE) {
    const { pathname, search } = action.payload.location;
    dispatch(applyLocation(pathname, search));
  }

  return result;
};

function sameRange(range, zoom, route) {
  if (range) {
    return zoom?.start === range.start && zoom?.end === range.end;
  }
  return !zoom || isWholeDrive(zoom, route);
}

function applyLocation(pathname, search) {
  return (dispatch, getState) => {
    const location = parseLocation(pathname, search);
    const { dongleId, page, routeId, range, legacyRange, modal } = location;

    // a device URL is written one way only, so /:dongleId/junk/ becomes /:dongleId
    const canonical = toPath({ ...location, modal: null });
    if (dongleId && canonical !== pathname) {
      dispatch(replace({ pathname: canonical, search }));
      return;
    }

    const state = getState();

    // a location without a device keeps the selected one
    if (dongleId && dongleId !== state.dongleId) {
      dispatch(selectDevice(dongleId));
    }

    if (page !== state.page || modal !== state.modal) {
      dispatch({ type: Types.ACTION_SELECT_VIEW, page, modal });
    }

    if (routeId !== state.selectedRouteId || !sameRange(range, state.zoom, state.currentRoute)) {
      dispatch(pushTimelineRange(routeId, range?.start ?? null, range?.end ?? null));
    }

    if (legacyRange) {
      dispatch(resolveLegacyRange(dongleId, legacyRange));
    }
  };
}

// Old links address a drive by unix timestamps. Swap them for the drive's own URL,
// unless the user has moved on while it was looked up.
function resolveLegacyRange(dongleId, { start, end }) {
  return async (dispatch, getState) => {
    const { key } = getState().router.location;
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, start, end);
      if (routes?.length && getState().router.location.key === key) {
        const routeId = routes[0].fullname.split('|')[1];
        dispatch(replace(toPath({ dongleId, routeId })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}
