import { history } from '../history';
import { getDongleID, getPrimeNav, getSegmentRange } from '../url';

export function selectPathname() {
  return history.location.pathname;
}

export function selectDongleId() {
  return getDongleID(selectPathname());
}

export function selectIsPrime() {
  return getPrimeNav(selectPathname());
}

export function selectSegmentRange() {
  return getSegmentRange(selectPathname());
}

export function selectRouteZoom(state) {
  const seg = getSegmentRange(selectPathname());
  if (!seg) return null;
  const route = state.routes && state.routes.find((r) => r.log_id === seg.log_id);
  if (!route) return null;
  const hasTimes = typeof seg.start === 'number' && typeof seg.end === 'number' && !Number.isNaN(seg.start) && !Number.isNaN(seg.end);
  if (!hasTimes) {
    return {
      start: 0,
      end: route.duration,
    };
  }
  return {
    start: seg.start - route.start_time_utc_millis,
    end: seg.end - route.start_time_utc_millis,
  };
}

export function selectCurrentRoute(state) {
  const seg = getSegmentRange(selectPathname());
  if (!seg) return null;
  return state.routes && state.routes.find((r) => r.log_id === seg.log_id) || null;
}

export function selectIsViewingRoute(state) {
  return Boolean(selectCurrentRoute(state));
}

export default {
  selectPathname,
  selectDongleId,
  selectIsPrime,
  selectSegmentRange,
  selectRouteZoom,
  selectCurrentRoute,
  selectIsViewingRoute,
};
