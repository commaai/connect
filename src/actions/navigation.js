import { goBack, push } from 'connected-react-router';
import { deviceUrl, driveUrl } from '../url';

export function navigate(to, historyState) {
  return (dispatch, getState) => {
    const { location } = getState().router;
    if (`${location.pathname}${location.search}${location.hash}` !== to) dispatch(push(to, historyState));
  };
}

export function selectDevice(dongleId) {
  return navigate(deviceUrl(dongleId));
}

export function pushTimelineRange(routeId, start, end) {
  return (dispatch, getState) => {
    const state = getState();
    const route = state.routeCache[routeId];
    const wholeDrive = start == null || end == null || (start === 0 && end === route?.duration);
    const range = wholeDrive ? null : { start: Math.round(start), end: Math.round(end) };
    const parent = !wholeDrive && state.navigation.routeId === routeId ? { rangeParent: state.router.location.key } : undefined;
    dispatch(navigate(driveUrl(state.dongleId, routeId, range), parent));
  };
}

export function popTimelineRange(routeId) {
  return (dispatch, getState) => {
    dispatch(getState().router.location.state?.rangeParent ? goBack() : pushTimelineRange(routeId));
  };
}

export function primeNav(open) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) dispatch(navigate(`${deviceUrl(dongleId)}${open ? '/prime' : ''}`));
  };
}

export function streamNav(open) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) dispatch(navigate(`${deviceUrl(dongleId)}${open ? '/stream' : ''}`));
  };
}
