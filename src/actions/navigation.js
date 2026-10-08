import { push, replace, goBack } from 'connected-react-router';
import { parsePath } from 'history';
import { dialogUrl } from '../url';

export const navigate = (url, replaceEntry = false) => replaceEntry ? replace(url) : push(url);

export function openDialog(dialog, dongleId = null) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    if (new URLSearchParams(location.search).get('dialog') === dialog
        && (!dongleId || new URLSearchParams(location.search).get('device') === dongleId)) return;
    dispatch(push({
      ...parsePath(dialogUrl(location, dialog, dongleId)),
      state: { dialogReturnKey: location.key },
    }));
  };
}

export function closeDialog(parent = null, dongleId = null) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    // Only go back for an overlay opened by this app. Cold links must stay in-app.
    if (location.state?.dialogReturnKey) dispatch(goBack());
    else dispatch(replace(dialogUrl(location, parent, dongleId)));
  };
}
