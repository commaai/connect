import { push, replace } from 'connected-react-router';
import { DIALOGS } from '../url';

export function openDialog(dialog, { settingsDongleId, clipFilename } = {}) {
  return (dispatch, getState) => {
    if (!DIALOGS.has(dialog)) return;
    const location = getState().router.location;
    const params = new URLSearchParams(location.search);
    params.set('dialog', dialog);
    if (settingsDongleId) params.set('settingsDevice', settingsDongleId);
    else params.delete('settingsDevice');
    if (clipFilename) params.set('clip', clipFilename);
    else params.delete('clip');
    const search = `?${params}`;
    if (search !== location.search) dispatch(push({ pathname: location.pathname, search, hash: location.hash }));
  };
}

export function closeDialog(parent = null) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    const params = new URLSearchParams(location.search);
    params.delete('clip');
    if (parent && DIALOGS.has(parent)) params.set('dialog', parent);
    else {
      params.delete('dialog');
      params.delete('settingsDevice');
    }
    const search = params.toString();
    dispatch(replace({ pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash }));
  };
}
