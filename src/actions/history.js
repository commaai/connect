import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { api } from '../api/backend';
import { NOWHERE, PUBLIC_PAGES, formatUrl } from '../url';
import { checkLastRoutesData, enterDevice, enterDrive } from './index';

let latest = 0;

const openLegacyRange = ({ dongleId, startMs, endMs }) => async (dispatch) => {
  const ticket = latest;
  try {
    const routes = await api.routes.getRoutesSegments(dongleId, startMs, endMs);
    const logId = routes?.[0]?.fullname.split('|')[1];
    if (logId && ticket === latest) dispatch(replace(formatUrl({ ...NOWHERE, page: 'drive', dongleId, logId })));
  } catch (err) {
    console.error('Error fetching routes data for log ID conversion', err);
  }
};

const reconcile = (place) => (dispatch, getState) => {
  const mayLoad = api.auth.isAuthenticated() || PUBLIC_PAGES.has(place.page);
  if (mayLoad && place.page === 'legacy') dispatch(openLegacyRange(place));
  if (!place.dongleId) return;
  const newDevice = mayLoad && place.dongleId !== getState().dongleId;
  if (newDevice) dispatch(enterDevice(place.dongleId));
  if (place.page !== 'legacy') dispatch(enterDrive(place));
  if (newDevice) dispatch(checkLastRoutesData());
};

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) return undefined;
  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    latest += 1;
    dispatch(reconcile(getState().place));
  }
  return result;
};
