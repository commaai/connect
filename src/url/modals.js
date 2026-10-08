import { MODALS, parseLocation } from '../url';

export function modalFromState(state) {
  const parsed = parseLocation(state.router.location);
  return parsed.ok ? parsed.state : { modal: null };
}

export function modalDevice(state, nav) {
  const id = nav.modalDevice || nav.dongleId;
  return state.devices?.find(device => device.dongle_id === id)
    || (state.device?.dongle_id === id ? state.device : null);
}

export function canManageDevice(device, profile) {
  return Boolean(device && (device.is_owner || profile?.superuser));
}

export function visibleModal(state) {
  const nav = modalFromState(state);
  if (MODALS[nav.modal]?.ownerOnly && !canManageDevice(modalDevice(state, nav), state.profile)) {
    return { ...nav, modal: null };
  }
  return nav;
}
