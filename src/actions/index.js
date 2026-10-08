import { push, replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { applyView } from '../applyUrl';
import { deviceUrl, editUrl, parseUrl, withFilter } from '../url';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { hasRoutesData } from '../timeline/segments';
import { ROUTE_PAGE_SIZE } from '../utils/filter';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { webrtcConnectionManager } from '../utils/webrtc';
import { hardNavigate } from '../utils/navigation';

let listRequest = null;
let routeRequest = null;
let legacyRequest = 0;
const currentPathname = (state) => state.router?.location?.pathname || window.location.pathname;

function normalizeRoutes(routesData) {
  return routesData.map((r) => {
    let startTime = r.segment_start_times[0];
    let endTime = r.segment_end_times[r.segment_end_times.length - 1];

    // TODO: these will all be relative times soon
    // fix segment boundary times for routes that have the wrong time at the start
    if ((Math.abs(r.start_time_utc_millis - startTime) > 24 * 60 * 60 * 1000)
        && (Math.abs(r.end_time_utc_millis - endTime) < 10 * 1000)) {
      startTime = r.start_time_utc_millis;
      endTime = r.end_time_utc_millis;
      r.segment_start_times = r.segment_numbers.map((x) => startTime + (x * 60 * 1000));
      r.segment_end_times = r.segment_numbers.map((x) => Math.min(startTime + ((x + 1) * 60 * 1000), endTime));
    }
    // TODO: backwards compatiblity, remove later
    if (r.distance == null && r.length != null) {
      r.distance = r.length;
    }
    return {
      ...r,
      url: r.url.replace('chffrprivate.blob.core.windows.net', 'chffrprivate.azureedge.net'),
      log_id: r.fullname.split('|')[1],
      duration: endTime - startTime,
      start_time_utc_millis: startTime,
      end_time_utc_millis: endTime,
      // TODO: get this from the API, this isn't correct for segments with a time jump
      segment_durations: r.segment_start_times.map((x, i) => r.segment_end_times[i] - x),
    };
  }).sort((a, b) => b.create_time - a.create_time);
}

function fetchRouteList(dongleId, start, end, limit) {
  return (dispatch, getState) => {
    if (listRequest
      && listRequest.dongleId === dongleId
      && listRequest.start === start
      && listRequest.end === end
      && listRequest.limit === limit) {
      return listRequest.promise;
    }

    const request = { dongleId, start, end, limit };
    listRequest = request;
    request.promise = api.routes.getRoutesSegments(dongleId, start, end, limit).then((routesData) => {
      if (listRequest !== request) return undefined;
      const state = getState();
      if (state.dongleId !== dongleId
        || state.filter.start !== start
        || state.filter.end !== end
        || state.limit !== limit) {
        listRequest = null;
        dispatch(checkRoutesData());
        return undefined;
      }
      if (routesData && routesData.length === 0 && !api.auth.isAuthenticated()) {
        listRequest = null;
        hardNavigate(`/?r=${encodeURI(currentPathname(state))}`);
        return undefined;
      }

      dispatch({
        type: Types.ACTION_ROUTES_METADATA,
        scope: 'list',
        dongleId,
        start,
        end,
        routes: normalizeRoutes(routesData || []),
      });
      listRequest = null;
      return routesData;
    }).catch((err) => {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
      if (listRequest === request) listRequest = null;
    });
    return request.promise;
  };
}

function fetchOneRoute(dongleId, logId) {
  return (dispatch, getState) => {
    const routeName = `${dongleId}|${logId}`;
    if (routeRequest && routeRequest.routeName === routeName) return routeRequest.promise;

    const request = { routeName, dongleId, logId };
    routeRequest = request;
    request.promise = api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, routeName).then((routesData) => {
      if (routeRequest !== request) return undefined;
      const state = getState();
      if (state.dongleId !== dongleId || state.selectedRouteId !== logId) {
        routeRequest = null;
        return undefined;
      }
      if (routesData && routesData.length === 0 && !api.auth.isAuthenticated()) {
        routeRequest = null;
        hardNavigate(`/?r=${encodeURI(currentPathname(state))}`);
        return undefined;
      }

      dispatch({
        type: Types.ACTION_ROUTES_METADATA,
        scope: 'route',
        dongleId,
        routes: normalizeRoutes(routesData || []),
      });
      routeRequest = null;
      return routesData;
    }).catch((err) => {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
      if (routeRequest === request) routeRequest = null;
    });
    return request.promise;
  };
}

export function checkRoutesData() {
  return (dispatch, getState) => {
    let state = getState();
    if (!state.dongleId) return undefined;

    // A drive the dashboard list already has does not need its own request.
    // A drive the list does not have is fetched on its own and merged in,
    // without pretending that one drive is the dashboard.
    if (state.selectedRouteId) {
      if (state.routes?.some((route) => route.log_id === state.selectedRouteId)) return undefined;
      return dispatch(fetchOneRoute(state.dongleId, state.selectedRouteId));
    }
    if (hasRoutesData(state)) return undefined;
    // A drive opened on a newly selected device never fetched a page, so limit
    // is still 0. The first dashboard page is one page, not an empty request.
    if (!state.limit) {
      dispatch({ type: Types.ACTION_UPDATE_ROUTE_LIMIT, limit: ROUTE_PAGE_SIZE });
      state = getState();
    }
    return dispatch(fetchRouteList(state.dongleId, state.filter.start, state.filter.end, state.limit));
  };
}

export function checkLastRoutesData() {
  return (dispatch, getState) => {
    const { limit, routes, filter } = getState();

    // if current routes are fewer than limit, that means the last fetch already fetched all the routes
    if (routes && routes.length < limit) {
      return
    }

    console.log(`fetching ${limit + ROUTE_PAGE_SIZE} routes`)
    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_LIMIT,
      limit: limit + ROUTE_PAGE_SIZE,
    })

    // invalidate cached routes while keeping the current filter range
    dispatch({
      type: Types.ACTION_SELECT_TIME_FILTER,
      start: filter.start,
      end: filter.end,
    });

    dispatch(checkRoutesData());
  };
}

function locationUrl(state) {
  const location = state.router?.location;
  return `${location?.pathname || ''}${location?.search || ''}`;
}

// Push a URL. The history middleware turns it into state.
export function navigate(url, asReplace = false) {
  return (dispatch, getState) => {
    if (locationUrl(getState()) === url) return;
    dispatch(asReplace ? replace(url) : push(url));
  };
}

// Apply a view that the URL does not itself name. Used for / and /demo and
// /referrals, which remember a device without putting it in the path.
export function commitView(view) {
  return (dispatch, getState) => {
    const { patch, effects } = applyView(getState(), view);
    if (Object.keys(patch).length) {
      dispatch({ type: Types.ACTION_APPLY_URL, patch });
    }
    if (effects.length) dispatch(runNavigationEffects(effects));
  };
}

export function focusDevice(dongleId) {
  return commitView(parseUrl(deviceUrl(dongleId)));
}

function syncPlayback(dispatch, getState) {
  const { zoom } = getState();
  dispatch(resetPlayback());
  if (zoom && zoom.start != null && zoom.end != null) {
    dispatch(selectLoop(zoom.start, zoom.end));
  }
}

export function resolveLegacy({ dongleId, start, end }) {
  return (dispatch, getState) => {
    legacyRequest += 1;
    const token = legacyRequest;
    api.routes.getRoutesSegments(dongleId, start, end).then((routesData) => {
      if (token !== legacyRequest) return;
      const state = getState();
      const view = parseUrl(state.router?.location?.pathname, state.router?.location?.search);
      if (view.page !== 'legacy' || view.dongleId !== dongleId || view.legacy?.start !== start || view.legacy?.end !== end) return;
      if (!routesData || routesData.length === 0) return;
      const logId = routesData[0].fullname.split('|')[1];
      const path = `/${dongleId}/${logId}`;
      dispatch(navigate(withFilter(state.router.location, path), true));
    }).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
    });
  };
}

export function runNavigationEffects(effects) {
  return (dispatch, getState) => {
    effects.forEach((effect) => {
      if (effect.type === 'device') {
        if (effect.previousId && effect.previousId !== effect.dongleId) {
          webrtcConnectionManager.disconnect();
        }
        window.localStorage.setItem('selectedDongleId', effect.dongleId);
        const state = getState();
        const device = getDeviceFromState(state, effect.dongleId);
        if ((device && !device.shared) || state.profile?.superuser) {
          dispatch(primeFetchSubscription(effect.dongleId, device));
          dispatch(fetchDeviceOnline(effect.dongleId));
        }
        if (state.selectedRouteId) dispatch(checkRoutesData());
        else dispatch(checkLastRoutesData());
      } else if (effect.type === 'routes' || effect.type === 'leave-drive' || effect.type === 'drive') {
        if (effect.type !== 'routes') syncPlayback(dispatch, getState);
        dispatch(checkRoutesData());
      } else if (effect.type === 'zoom') {
        syncPlayback(dispatch, getState);
      } else if (effect.type === 'legacy') {
        dispatch(resolveLegacy(effect));
      }
    });
  };
}


export function primeGetSubscription(dongleId, subscription) {
  return {
    type: Types.ACTION_PRIME_SUBSCRIPTION,
    dongleId,
    subscription,
  };
}

export function primeFetchSubscription(dongleId, device, profile) {
  return (dispatch, getState) => {
    const state = getState();

    if (!device && state.device && state.device === dongleId) {
      device = state.device;
    }
    if (!profile && state.profile) {
      profile = state.profile;
    }

    if (device && (device.is_owner || profile.superuser)) {
      if (device.prime) {
        Billing.getSubscription(dongleId).then((subscription) => {
          dispatch(primeGetSubscription(dongleId, subscription));
        }).catch((err) => {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'actions_fetch_subscription' });
        });
      } else {
        Billing.getSubscribeInfo(dongleId).then((subscribeInfo) => {
          dispatch({
            type: Types.ACTION_PRIME_SUBSCRIBE_INFO,
            dongleId,
            subscribeInfo,
          });
        }).catch((err) => {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'actions_fetch_subscribe_info' });
        });
      }
    }
  };
}

export function fetchDeviceOnline(dongleId) {
  return (dispatch) => {
    api.devices.fetchDevice(dongleId).then((resp) => {
      dispatch({
        type: Types.ACTION_UPDATE_DEVICE_ONLINE,
        dongleId,
        last_athena_ping: resp.last_athena_ping,
        fetched_at: Math.floor(Date.now() / 1000),
      });
    }).catch(console.log);
  };
}

export function selectDevice(dongleId) {
  return (dispatch, getState) => {
    const state = getState();
    const path = deviceUrl(dongleId);
    const url = state.dongleId === dongleId ? withFilter(state.router?.location, path) : path;
    dispatch(navigate(url));
  };
}

export function fetchSharedDevice(dongleId) {
  return async (dispatch) => {
    try {
      const resp = await api.devices.fetchDevice(dongleId);
      dispatch({
        type: Types.ACTION_UPDATE_SHARED_DEVICE,
        dongleId,
        device: resp,
      });
    } catch (err) {
      if (!err.resp || err.resp.status !== 403) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'action_fetch_shared_device' });
      }
    }
  };
}

export function updateDeviceOnline(dongleId, lastAthenaPing) {
  return (dispatch) => {
    dispatch({
      type: Types.ACTION_UPDATE_DEVICE_ONLINE,
      dongleId,
      last_athena_ping: lastAthenaPing,
      fetched_at: Math.floor(Date.now() / 1000),
    });
  };
}

export function fetchDeviceNetworkStatus(dongleId) {
  return async (dispatch, getState) => {
    const device = getDeviceFromState(getState(), dongleId);
    if (deviceVersionAtLeast(device, '0.8.14')) {
      const payload = {
        id: 0,
        jsonrpc: '2.0',
        method: 'getNetworkMetered',
      };
      try {
        const resp = await Athena.postJsonRpcPayload(dongleId, payload);
        if (resp && resp.result !== undefined) {
          dispatch({
            type: Types.ACTION_UPDATE_DEVICE_NETWORK,
            dongleId,
            networkMetered: resp.result,
          });
          dispatch(updateDeviceOnline(dongleId, Math.floor(Date.now() / 1000)));
        }
      } catch (err) {
        if (err.message && (err.message.indexOf('Timed out') === -1 || err.message.indexOf('Device not registered') === -1)) {
          dispatch(updateDeviceOnline(dongleId, 0));
        } else {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'athena_fetch_networkmetered' });
        }
      }
    } else {
      const payload = {
        id: 0,
        jsonrpc: '2.0',
        method: 'getNetworkType',
      };
      try {
        const resp = await Athena.postJsonRpcPayload(dongleId, payload);
        if (resp && resp.result !== undefined) {
          const metered = resp.result !== 1 && resp.result !== 6; // wifi or ethernet
          dispatch({
            type: Types.ACTION_UPDATE_DEVICE_NETWORK,
            dongleId,
            networkMetered: metered,
          });
          dispatch(updateDeviceOnline(dongleId, Math.floor(Date.now() / 1000)));
        }
      } catch (err) {
        if (err.message && (err.message.indexOf('Timed out') === -1 || err.message.indexOf('Device not registered') === -1)) {
          dispatch(updateDeviceOnline(dongleId, 0));
        } else {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'athena_fetch_networktype' });
        }
      }
    }
  };
}

export function fetchDeviceNotCar(dongleId) {
  return async (dispatch, getState) => {
    const device = getDeviceFromState(getState(), dongleId);
    if (!deviceIsOnline(device)) {
      return;
    }
    const payload = {
      id: 0,
      jsonrpc: '2.0',
      method: 'getNotCar',
    };
    try {
      const resp = await Athena.postJsonRpcPayload(dongleId, payload);
      if (resp && resp.result !== undefined) {
        dispatch({
          type: Types.ACTION_UPDATE_DEVICE_RPC,
          dongleId,
          fields: { not_car: resp.result === true },
        });
      }
    } catch (err) {
      if (!err.message || err.message.indexOf('Device not registered') === -1) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'athena_fetch_notcar' });
      }
    }
  };
}

export function updateDevices(devices) {
  return {
    type: Types.ACTION_UPDATE_DEVICES,
    devices,
  };
}

export function updateDevice(device) {
  return {
    type: Types.ACTION_UPDATE_DEVICE,
    device,
  };
}

export function selectTimeFilter(start, end) {
  return (dispatch, getState) => {
    const { pathname, search } = getState().router.location;
    dispatch(navigate(editUrl(pathname, search, { from: start, to: end, filter: null })));
  };
}

export function analyticsEvent(name, parameters) {
  return {
    type: Types.ANALYTICS_EVENT,
    name,
    parameters,
  };
}

export function updateRoute(fullname, route) {
  return {
    type: Types.ACTION_UPDATE_ROUTE,
    fullname,
    route,
  };
}
