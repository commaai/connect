import { goBack, push, replace } from 'connected-react-router';

import { urlFor } from '../url';

const currentUrl = ({ router }) => `${router.location.pathname}${router.location.search}`;

export function navigate(target, { replace: replaceEntry = false } = {}) {
  return (dispatch, getState) => {
    const state = getState();
    const url = urlFor({ search: state.router.location.search, dongleId: state.dongleId, ...target });
    const from = currentUrl(state);
    if (url !== from) {
      dispatch(replaceEntry ? replace(url) : push(url, { from }));
    }
  };
}

export function navigateBack(target) {
  return (dispatch, getState) => {
    const { router, dongleId } = getState();
    if (router.location.state?.from === urlFor({ search: router.location.search, dongleId, ...target })) {
      dispatch(goBack());
    } else {
      dispatch(navigate(target));
    }
  };
}

export const selectDevice = (dongleId) => navigate({ page: 'dashboard', dongleId });

export function selectDrive(logId, start = null, end = null) {
  return (dispatch, getState) => {
    const route = getState().routes?.find((r) => r.log_id === logId);
    const wholeDrive = start === null || end === null || (start === 0 && end === route?.duration);
    dispatch(navigate({ page: 'drive', logId, zoom: wholeDrive ? null : { start, end } }));
  };
}

export const openModal = (modal) => (dispatch, getState) => dispatch(navigate({ ...getState().nav, modal }));

export const closeModal = () => (dispatch, getState) => dispatch(navigateBack({ ...getState().nav, modal: null }));
