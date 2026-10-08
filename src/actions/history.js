import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { canonicalUrl, isPublic, parseUrl, urlFor } from '../url';
import { checkRouteData, checkRoutesData, selectDevice, selectRoute } from './index';
import { api } from '../api/backend';

// links from before drives had ids point at a time range, open the drive recorded in it
const openLegacyLink = ({ dongleId, start, end }) => async (dispatch, getState) => {
  const { location } = getState().router;
  try {
    const routes = await api.routes.getRoutesSegments(dongleId, start, end);
    const routeId = routes?.[0]?.fullname.split('|')[1];
    if (routeId && getState().router.location === location) {
      dispatch(replace(urlFor('drive', { dongleId, routeId })));
    }
  } catch (err) {
    console.error('Error fetching routes data for log ID conversion', err);
  }
};

// url -> state. the screen is a function of the url, this makes the state agree with it.
// every step is skipped when the state already agrees, so it can run any number of times
// and moving between urls only changes, and only fetches, what is different
export const applyUrl = () => (dispatch, getState) => {
  const state = getState();
  const { pathname, search } = state.router.location;
  if (!api.auth.isAuthenticated() && !isPublic(pathname)) {
    return; // the login page is on screen
  }

  // the login page sends people on to where they were going. only ever to one of our pages
  const redirect = new URLSearchParams(search).get('r');
  if (redirect) {
    dispatch(replace(canonicalUrl(redirect)));
    return;
  }
  const url = parseUrl(pathname);

  // a page without a device keeps the current one
  const dongleId = url.dongleId || state.dongleId;
  if (!dongleId) {
    return; // the devices aren't loaded yet, or there are none
  }
  if (dongleId !== state.dongleId) {
    dispatch(selectDevice(dongleId));
  }
  if (url.page === 'home') {
    dispatch(replace(urlFor('dashboard', { dongleId })));
    return;
  }

  const zoomed = url.page === 'zoom' && url.start < url.end;
  dispatch(selectRoute(url.routeId ?? null, zoomed ? { start: url.start * 1000, end: url.end * 1000 } : null));

  if (url.page === 'legacy') {
    dispatch(openLegacyLink(url));
  }
  dispatch(url.routeId ? checkRouteData() : checkRoutesData());
};

// the first page load, links, back and forward all arrive here as a location change
export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyUrl());
  }
  return result;
};
