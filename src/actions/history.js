import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, deviceUrl, driveUrl } from '../url';
import { checkRoutesData, activateDevice, fetchSharedDevice } from './index';
import { resetPlayback, selectLoop, seek, pause } from '../timeline/playback';
import * as Types from './types';
import { api } from '../api/backend';

const revisions = new WeakMap();

// The only URL -> data-selection flow. Used for initial load, PUSH, POP and REPLACE.
export function applyLocation() {
  return async (dispatch, getState) => {
    const revision = (revisions.get(getState) || 0) + 1;
    revisions.set(getState, revision);
    const state = getState();
    const location = state.router.location;
    const view = parseLocation(location);
    const savedDevice = window.localStorage.getItem('selectedDongleId');
    const fallback = state.devices?.find((d) => d.dongle_id === savedDevice)?.dongle_id
      || state.defaultDongleId || state.devices?.[0]?.dongle_id;
    const dongleId = view.dongleId || (view.page === 'referrals' ? state.dongleId : fallback);

    if (view.page === 'home' && fallback) {
      dispatch(replace({ ...location, pathname: deviceUrl(fallback) }));
      return;
    }
    if (dongleId && dongleId !== state.dongleId) dispatch(activateDevice(dongleId));

    if (view.legacyRange) {
      try {
        const routes = await api.routes.getRoutesSegments(dongleId, view.legacyRange.start, view.legacyRange.end);
        if (revisions.get(getState) !== revision) return;
        if (routes?.length) {
          dispatch(replace({ ...location, pathname: driveUrl(dongleId, routes[0].fullname.split('|')[1]) }));
        }
      } catch (err) {
        console.error('Error fetching routes data for log ID conversion', err);
      }
      return;
    }

    const selected = getState();
    const logId = view.logId;
    const route = selected.routes?.find((r) => r.log_id === logId);
    const start = view.range?.start ?? (route ? 0 : null);
    const end = view.range?.end ?? route?.duration ?? null;
    const routeChanged = selected.selectedRouteId !== logId;
    const rangeChanged = selected.zoom?.start !== start || selected.zoom?.end !== end;
    if (routeChanged || (logId && rangeChanged)) {
      dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: logId, start, end });
      if (logId) {
        if (routeChanged) dispatch(resetPlayback());
        dispatch(selectLoop(start, end));
        const offset = getState().offset;
        if (start != null && (routeChanged || offset < start || offset >= end)) dispatch(seek(start));
      } else dispatch(pause());
    }
    if (dongleId && ['dashboard', 'drive', 'demo'].includes(view.page)) dispatch(checkRoutesData());
    if (dongleId && selected.devices && !selected.devices.some((d) => d.dongle_id === dongleId)
        && selected.device?.dongle_id !== dongleId) dispatch(fetchSharedDevice(dongleId));
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) return;
  const result = next(action);
  if (action.type === LOCATION_CHANGE) dispatch(applyLocation());
  return result;
};
