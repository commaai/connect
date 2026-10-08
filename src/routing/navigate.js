// Build destinations and update history; middleware commits navigation state.

import { goBack, push, replace } from 'connected-react-router';

import {
  VIEWS,
  buildUrl,
  deviceBase,
  driveBase,
  locationForEdit,
  locationOfUrl,
  parseLocation,
  referralsBase,
  rootBase,
  urlOfRouterLocation,
} from './codec';
import { selectNavLocation } from './selectors';
import { fallbackServices } from './services';

// Record the parent entry on PUSH for verified Back navigation.
export function navigateToLocation(location, { replace: replaceEntry = false } = {}) {
  return (dispatch, getState) => {
    const url = buildUrl(location);
    const current = getState().router.location;
    if (!url || url === urlOfRouterLocation(current)) return;
    if (replaceEntry) {
      dispatch(replace(url));
    } else {
      dispatch(push(url, { parent: { key: current.key ?? null, url: urlOfRouterLocation(current) } }));
    }
  };
}

export function navigate(base, options) {
  return (dispatch, getState) =>
    dispatch(navigateToLocation(locationForEdit(base, selectNavLocation(getState())), options));
}

export const toRoot = () => navigate(rootBase());
export const toDashboard = (dongleId) => navigate(dongleId ? deviceBase(VIEWS.DASHBOARD, dongleId) : rootBase());
export const toPrime = (dongleId) => navigate(deviceBase(VIEWS.PRIME, dongleId));
export const toStream = (dongleId) => navigate(deviceBase(VIEWS.STREAM, dongleId));
export const toReferrals = () => navigate(referralsBase());
export const toDrive = (dongleId, logId) => navigate(driveBase(dongleId, logId));

// Round valid millisecond selections outward to whole seconds; otherwise return null.
export function quantizeRange(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) return null;
  const start = Math.floor(startMs / 1000) * 1000;
  const end = Math.ceil(endMs / 1000) * 1000;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  return { start, end };
}

export function toDriveRange(dongleId, logId, startMs, endMs) {
  return (dispatch) => {
    const range = quantizeRange(startMs, endMs);
    if (!range) return;
    dispatch(navigate(driveBase(dongleId, logId, range.start, range.end)));
  };
}

// Return to an accepted, verified parent; otherwise use the fallback.
function backOr(accepts, fallback, options) {
  return (dispatch, getState, services = fallbackServices) => {
    const current = getState().router.location;
    const parentUrl = services.history.verifiedParentUrl(current);
    if (parentUrl && accepts(parseLocation(locationOfUrl(parentUrl)).base)) {
      dispatch(goBack());
      return;
    }
    dispatch(navigate(fallback, options));
  };
}

const anyParent = () => true;

// leave a full-page task (Prime, stream, referrals) for where the user came from
export const leavePage = (dongleId) => backOr(anyParent, dongleId ? deviceBase(VIEWS.DASHBOARD, dongleId) : rootBase());

// Drive Back restores a verified wider selection, or falls back to the whole drive.
export function driveBack() {
  return (dispatch, getState) => {
    const base = selectNavLocation(getState())?.base;
    if (base?.view !== VIEWS.DRIVE || base.drive.start == null) return;
    const { dongleId, drive } = base;
    const wider = (parent) =>
      parent.view === VIEWS.DRIVE
      && parent.dongleId === dongleId
      && parent.drive.logId === drive.logId
      && (parent.drive.start == null || (parent.drive.start <= drive.start && parent.drive.end >= drive.end));
    dispatch(backOr(wider, driveBase(dongleId, drive.logId), { replace: true }));
  };
}
