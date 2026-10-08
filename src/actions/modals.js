import { push, replace } from 'connected-react-router';

import { withParams, withoutParams } from '../url';

// Modals live in the URL as query parameters on the current page (see
// url.js for the grammar). Opening pushes a history entry, so the back
// button closes the modal; closing replaces the entry so back navigates
// to the page the modal was opened from.

export function openModal(params) {
  return (dispatch, getState) => {
    const { pathname, search } = getState().router.location;
    dispatch(push(withParams(pathname + search, params)));
  };
}

export function closeModal(...keys) {
  return (dispatch, getState) => {
    const { pathname, search } = getState().router.location;
    dispatch(replace(withoutParams(pathname + search, ...keys)));
  };
}
