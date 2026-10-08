import { goBack, push, replace } from 'connected-react-router';
import { parseLocation, withModal, withClip, canonicalLocation } from '../url';

const href = ({ pathname = '/', search = '', hash = '' }) => `${pathname}${search}${hash}`;

export function navigate(destination, replaceEntry = false) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    const original = typeof destination === 'string' ? destination : href(destination);
    const target = canonicalLocation(original);
    if (target !== href(location)) {
      const action = replaceEntry ? replace : push;
      return dispatch(target === original ? action(destination) : action(target, destination?.state));
    }
  };
}

export function openModal(modal, modalDongleId, plan) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    const target = withModal(location, modal, modalDongleId, plan);
    if (target !== href(location)) {
      dispatch(push(target, { ...location.state, modalReturnTo: href(location) }));
    }
  };
}

export function closeModal(parentModal = null) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    const { modalDongleId } = parseLocation(location);
    const target = withModal(location, parentModal, parentModal ? modalDongleId : null);
    const opener = location.state?.modalReturnTo;
    const openerRoute = parseLocation(opener);
    const normalizedOpener = typeof opener === 'string'
      ? withModal(opener, parentModal, parentModal ? modalDongleId : null) : null;
    if (openerRoute.modal === parentModal && !openerRoute.clip && normalizedOpener === target) {
      dispatch(goBack());
    } else {
      // A pasted or reloaded deep link must also close without leaving Connect.
      const state = { ...location.state };
      delete state.modalReturnTo;
      dispatch(replace(target, state));
    }
  };
}

export function openClip(filename, action) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    const target = withClip(location, filename, action);
    if (target !== href(location)) {
      dispatch(push(target, { ...location.state, modalReturnTo: href(location) }));
    }
  };
}
