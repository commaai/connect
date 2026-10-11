import { parseUrl } from '../url';
import { getDefaultFilter } from '../utils/filter';

const sameRange = (a, b) => a?.start === b?.start && a?.end === b?.end;

function selectDevice(state, dongleId) {
  const otherRoutes = state.routesMeta?.dongleId !== dongleId;
  return {
    ...state,
    dongleId,
    device: state.devices?.find((d) => d.dongle_id === dongleId) || (state.device?.dongle_id === dongleId ? state.device : null),
    filter: getDefaultFilter(),
    subscription: null,
    subscribeInfo: null,
    files: null,
    limit: 0,
    ...(otherRoutes && {
      routesMeta: { dongleId: null, start: null, end: null },
      routes: null,
      lastRoutes: null,
      currentRoute: null,
    }),
  };
}

// The only place navigation state is written: the url decides the page, device, drive and zoom.
export function applyLocation(_state, pathname) {
  const { page, dongleId, logId = null, zoom } = parseUrl(pathname);
  if (!dongleId) return { ..._state, page }; // root and referrals keep the last device

  let state = { ..._state, page };
  if (dongleId !== state.dongleId) state = selectDevice(state, dongleId);

  const sameDrive = logId && logId === state.selectedRouteId;
  const currentRoute = (sameDrive && state.currentRoute) || state.routes?.find((r) => r.log_id === logId) || null;
  const range = zoom || (currentRoute && { start: 0, end: currentRoute.duration });
  state.selectedRouteId = logId;
  state.currentRoute = logId ? currentRoute : null;

  const newZoom = logId && range ? (sameDrive && sameRange(state.zoom, range) ? state.zoom : range) : null;
  if (newZoom !== state.zoom) {
    const inside = newZoom && state.zoom && newZoom.start >= state.zoom.start && newZoom.end <= state.zoom.end;
    if (!inside) state.files = null;
    state.zoom = newZoom;
  }
  return state;
}
