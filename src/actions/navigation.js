import { push, replace, goBack } from 'connected-react-router';
import { parseLocation, buildLocation } from '../url';
import { DEMO_DONGLE_ID } from '../api/demo';

export const currentLocation = (state) => state.router?.location || window.location;
const address = ({ pathname, search = '', hash = '' }) => pathname + search + hash;

export function navigate(selection, options = {}) {
  return (dispatch, getState) => {
    const location = currentLocation(getState());
    const parsed = parseLocation(location);
    const base = parsed.ok ? parsed.state : { search: location.search, hash: location.hash };
    const view = { ...base, modal: null, modalDevice: null, clip: null,
      logId: null, zoom: null, legacyRange: null, ...selection };
    if (selection.demo === undefined) view.demo = ['dashboard', 'drive'].includes(view.page)
      && view.dongleId === DEMO_DONGLE_ID;
    const target = buildLocation(view);
    const sameAddress = address(location) === address(target);
    const oldZoom = location.state?.connectZoom || base.zoom;
    const sameZoom = oldZoom?.start === selection.zoom?.start && oldZoom?.end === selection.zoom?.end;
    if (sameAddress && (!selection.zoom || sameZoom)) return;
    const state = selection.zoom ? { ...options.state, connectZoom: selection.zoom } : options.state;
    dispatch((options.replace || sameAddress ? replace : push)({ ...target, state }));
  };
}

export function openModal(modal, { modalDevice = null, clip = null } = {}) {
  return (dispatch, getState) => {
    const location = currentLocation(getState());
    const parsed = parseLocation(location);
    if (!parsed.ok) return;
    const target = buildLocation({ ...parsed.state, modal, modalDevice, clip });
    if (address(target) === address(location)) return;
    dispatch(push({ ...target, state: { connectZoom: location.state?.connectZoom, connectReturn: address(location) } }));
  };
}

export function closeModal() {
  return (dispatch, getState) => {
    const location = currentLocation(getState());
    const parsed = parseLocation(location);
    if (!parsed.ok || !parsed.state.modal) return;
    const parent = { unpair: 'settings', 'settings-uploads': 'settings', clip: 'clips', 'delete-clip': 'clips' }[parsed.state.modal];
    const target = buildLocation({ ...parsed.state, modal: parent || null,
      modalDevice: parent === 'settings' ? parsed.state.modalDevice : null, clip: null });
    if (location.state?.connectReturn === address(target)) dispatch(goBack());
    else dispatch(replace({ ...target, state: { connectZoom: location.state?.connectZoom } }));
  };
}

export function closeDrive() {
  return (dispatch, getState) => {
    const parsed = parseLocation(currentLocation(getState()));
    if (!parsed.ok) return;
    dispatch(navigate({ page: 'dashboard', dongleId: parsed.state.dongleId, demo: parsed.state.demo }, { replace: true }));
  };
}
