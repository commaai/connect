import { LOCATION_CHANGE, goBack, push, replace } from 'connected-react-router';
import { createPath } from 'history';

import { api, selectBackendType } from '../api/backend';
import { hasRoutesData } from '../timeline/segments';
import { hardNavigate } from '../utils/navigation';
import { buildUrl, canonicalUrl, dialogUrl, parseUrl, selectUrl } from '../url';
import {
  checkLastRoutesData, checkRoutesData, selectDeviceState, selectTimelineRange,
} from './index';

// Components only request a destination. The history middleware below is the
// single place where a URL is applied to application state.
export function navigateTo(destination, options = {}) {
  return (dispatch, getState) => {
    const state = getState();
    const current = state.router.location;
    const pathname = buildUrl({ dongleId: state.dongleId, ...destination });
    const target = options.preserveUrlSuffix
      ? createPath({ ...current, pathname })
      : pathname;
    if (target !== createPath(current)) {
      const navigate = options.replace ? replace : push;
      dispatch(navigate(target));
    }
  };
}

export function openDialog(dialog, values = {}) {
  return (dispatch, getState) => {
    const { location } = getState().router;
    const current = createPath(location);
    const target = dialogUrl(location, dialog, values);
    if (target !== current) {
      dispatch(push(target, { returnTo: current }));
    }
  };
}

export function closeDialog(parentDialog = null) {
  return (dispatch, getState) => {
    const state = getState();
    const { location } = state.router;
    const target = dialogUrl(location, parentDialog, {
      device: selectUrl(state).dialogDongleId,
    });
    if (location.state?.returnTo === target) {
      dispatch(goBack());
    } else {
      dispatch(replace(target));
    }
  };
}

export function navigateToDrive(logId, start = null, end = null) {
  return (dispatch, getState) => {
    const state = getState();
    const route = state.routes?.find((candidate) => candidate.log_id === logId)
      || (state.currentRoute?.log_id === logId ? state.currentRoute : null);
    const wholeDrive = (start == null && end == null)
      || (start === 0 && end === route?.duration);
    const destination = { page: 'drive', dongleId: state.dongleId, logId };
    const current = createPath(state.router.location);
    const parent = buildUrl(destination);
    const target = wholeDrive ? parent : buildUrl({ ...destination, start, end });
    if (target === current) {
      return;
    }
    dispatch(current === parent ? push(target, { returnTo: parent }) : push(target));
  };
}

export function navigateBackFromDriveRange() {
  return (dispatch, getState) => {
    const { location } = getState().router;
    const current = parseUrl(location.pathname);
    if (current.page !== 'drive') {
      return;
    }
    const target = buildUrl({ ...current, start: undefined, end: undefined });
    if (location.state?.returnTo === target) {
      dispatch(goBack());
    } else {
      dispatch(replace(target));
    }
  };
}

export function applyLocation(location, isCurrent = () => true) {
  return async (dispatch, getState) => {
    if (!location) {
      return;
    }

    if (location.page === 'home' && getState().dongleId) {
      dispatch(navigateTo(
        { page: 'dashboard' },
        { preserveUrlSuffix: true, replace: true },
      ));
      return;
    }

    const deviceChanged = location.dongleId && location.dongleId !== getState().dongleId;
    if (deviceChanged) {
      dispatch(selectDeviceState(location.dongleId));
    }

    if (location.page === 'drive') {
      dispatch(selectTimelineRange(
        location.logId,
        location.start ?? null,
        location.end ?? null,
      ));
      dispatch(checkRoutesData());
      return;
    }

    dispatch(selectTimelineRange(null, null, null));
    if (location.page === 'dashboard' && !hasRoutesData(getState())) {
      dispatch(checkLastRoutesData());
    }
    if (location.page === 'legacy') {
      try {
        const [route] = await api.routes.getRoutesSegments(location.dongleId, location.from, location.to) ?? [];
        if (route && isCurrent()) {
          const pathname = buildUrl({
            page: 'drive', dongleId: location.dongleId, logId: route.fullname.split('|')[1],
          });
          dispatch(replace(createPath({ ...getState().router.location, pathname })));
        }
      } catch (err) {
        console.error('Error fetching routes data for log ID conversion', err);
      }
    }
  };
}

export const onHistoryMiddleware = ({ dispatch, getState }) => {
  const backendType = selectBackendType(getState().router.location.pathname);
  let appliedLocation;
  return (next) => (action) => {
    if (!action) {
      return undefined;
    }
    const result = next(action);
    if (action.type !== LOCATION_CHANGE) {
      return result;
    }

    const { location } = action.payload;
    const { pathname } = location;
    const currentUrl = createPath(location);
    const target = canonicalUrl(location);
    if (target !== currentUrl) {
      dispatch(replace(target));
      return result;
    }
    if (selectBackendType(pathname) !== backendType) {
      hardNavigate(currentUrl);
      return result;
    }
    if (pathname === appliedLocation?.pathname) {
      return result;
    }
    appliedLocation = location;
    dispatch(applyLocation(parseUrl(pathname), () => appliedLocation === location));
    return result;
  };
};
