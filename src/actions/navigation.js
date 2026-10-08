import { goBack, push, replace } from 'connected-react-router';
import { dialogLocation, parseLocation, pathFor } from '../url';

export function navigate(destination, replaceEntry = false) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    const pathname = pathFor(destination);
    if (location.pathname !== pathname || location.search || location.hash) {
      dispatch((replaceEntry ? replace : push)(pathname));
    }
  };
}

export function openDialog(dialog, device, clipFilename) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    const target = dialogLocation(location, dialog, device, clipFilename);
    if (target.search !== location.search) {
      dispatch(push({ ...target, state: { dialogParent: { ...dialogLocation(location, null), search: location.search } } }));
    }
  };
}

export function closeDialog() {
  return (dispatch, getState) => {
    const location = getState().router.location;
    if (location.state?.dialogParent) {
      dispatch(goBack());
    } else {
      const route = parseLocation(location);
      const parent = ['settings-uploads', 'unpair'].includes(route.dialog) ? 'settings' : ['clip', 'delete-clip'].includes(route.dialog) ? 'clips' : null;
      dispatch(replace(dialogLocation(location, parent, parent === 'settings' ? route.settingsDevice : null)));
    }
  };
}
