import { goBack, push, replace } from 'connected-react-router';
import { deviceUrl, driveUrl, modalLocation } from '../url';

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

export function openModal(name, dongleId = null, clip = null) {
  return (dispatch, getState) => {
    const { location } = getState().router;
    const target = modalLocation(location, name, dongleId, clip);
    if (target.search !== location.search) {
      dispatch(push({ ...target, state: { modalParent: location.key } }));
    }
  };
}

export function closeModal() {
  return (dispatch, getState) => {
    const { location } = getState().router;
    // An in-app modal has a parent history entry. Cold links close in place.
    dispatch(location.state?.modalParent ? goBack() : replace(modalLocation(location, null)));
  };
}
