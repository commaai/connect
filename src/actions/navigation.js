import { push, replace, goBack } from 'connected-react-router';
import { parsePath } from 'history';
import { dialogUrl } from '../url';

export function navigate(url, replaceEntry = false) {
  return replaceEntry ? replace(url) : push(url);
}

export function openDialog(dialog, dongleId = null) {
  return (dispatch, getState) => {
    const { location } = getState().router;
    const query = new URLSearchParams(location.search || '');
    if (query.get('dialog') === dialog && (!dongleId || query.get('device') === dongleId)) {
      return;
    }
    dispatch(push({
      ...parsePath(dialogUrl(location, dialog, dongleId)),
      state: { dialogReturnKey: location.key },
    }));
  };
}

export function closeDialog(parent = null, dongleId = null) {
  return (dispatch, getState) => {
    const { location } = getState().router;
    if (location.state?.dialogReturnKey) {
      dispatch(goBack());
    } else {
      dispatch(replace(dialogUrl(location, parent, dongleId)));
    }
  };
}
