import { push } from 'connected-react-router';
import { locationWithDialog, parseLocation } from '../url';

// To manage global state management

export const openDialog = (dialog, dongleId, clipFilename) => (dispatch, getState) => {
  const location = getState().router.location;
  const route = parseLocation(location);
  const parent = route.dialog ? { dialog: route.dialog, dongleId: route.dialogDongleId, clipFilename: route.clipFilename } : null;
  const next = locationWithDialog(location, dialog, dongleId, clipFilename);
  if (next.search !== location.search) {
    dispatch(push({ ...next, state: { ...location.state, dialogParent: parent } }));
  }
};

export const closeDialog = () => (dispatch, getState) => {
  const location = getState().router.location;
  const route = parseLocation(location);
  if (!route.dialog) return;
  const parent = location.state?.dialogParent || null;
  const next = locationWithDialog(location, parent?.dialog, parent?.dongleId, parent?.clipFilename);
  const state = { ...location.state };
  delete state.dialogParent;
  dispatch(push({ ...next, state }));
};
