import { push, replace, goBack } from 'connected-react-router';
import { parseUrl, serializeUrl } from './routes';

export const ROUTE_CHANGED = 'routing/changed';
export const navigate = (route) => push(serializeUrl(route));
export const openDialog = (dialog, dialogDeviceId) => (dispatch, getState) => {
  const { router } = getState();
  const location = router.location;
  dispatch(push({
    pathname: location.pathname,
    search: new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), dialog, ...(dialogDeviceId ? { device: dialogDeviceId } : {}) }).toString(),
    state: { dialogParent: `${location.pathname}${location.search || ''}` },
  }));
};

export const closeDialog = () => (dispatch, getState) => {
  const { router } = getState();
  const location = router.location;
  if (location.state?.dialogParent) return dispatch(goBack());
  const route = parseUrl(location);
  const query = new URLSearchParams(location.search);
  ['dialog', 'device', 'pair'].forEach((key) => query.delete(key));
  // A direct link has no in-app parent history entry; replace it safely.
  dispatch(replace(`${serializeUrl({ ...route, dialog: null })}${query.size ? `?${query}` : ''}`));
};
