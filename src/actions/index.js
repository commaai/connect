import { push } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { resetPlayback, selectLoop } from '../timeline/playback';
import {hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { webrtcConnectionManager } from '../utils/webrtc';
import { hardNavigate } from '../utils/navigation';
import { LIMIT_INCREMENT } from '../utils/filter';
import { urlFor } from '../url';

let routesRequest = null;
let routesRequestPromise = null;
let routeRequest = null;
const currentPathname = (state) => state.router?.location?.pathname || window.location.pathname;

function toRoute(r) {
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
}

function redirectToLogin(state) {
  hardNavigate(`/?r=${encodeURI(currentPathname(state))}`);
}

// the drives of the dashboard
export function checkRoutesData() {
  return (dispatch, getState) => {
    let state = getState();
    if (!state.dongleId) {
      return;
    }
    if (hasRoutesData(state)) {
      // already has metadata, don't bother
      return;
    }
    if (routesRequest && routesRequest.dongleId === state.dongleId) {
      // there is already an pending request
      return routesRequestPromise;
    }
    console.debug('We need to update the segment metadata...');
    const { dongleId, limit: fetchLimit } = state;
    const fetchRange = state.filter;

    routesRequest = {
      req: api.routes.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, fetchLimit),
      dongleId,
    };

    routesRequestPromise = routesRequest.req.then((routesData) => {
      state = getState();
      const currentRange = state.filter;
      if (currentRange.start !== fetchRange.start
        || currentRange.end !== fetchRange.end
        || state.limit !== fetchLimit
        || state.dongleId !== dongleId) {
        routesRequest = null;
        dispatch(checkRoutesData());
        return;
      }
      if (routesData && routesData.length === 0
        && !api.auth.isAuthenticated()) {
        routesRequest = null;
        redirectToLogin(state);
        return;
      }

      const routes = routesData.map(toRoute).sort((a, b) => {
        return b.create_time - a.create_time;
      });

      dispatch({
        type: Types.ACTION_ROUTES_METADATA,
        dongleId,
        start: fetchRange.start,
        end: fetchRange.end,
        routes,
      });

      routesRequest = null;

      return routes
    }).catch((err) => {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
      routesRequest = null;
    });

    return routesRequestPromise
  };
}

// the drive of the url. it is fetched on its own unless the dashboard already listed it,
// so opening a drive never replaces the dashboard's drives
export function checkRouteData() {
  return async (dispatch, getState) => {
    const state = getState();
    const fullname = `${state.dongleId}|${state.selectedRouteId}`;
    if (!state.selectedRouteId || state.currentRoute !== null || routeRequest === fullname) {
      return;
    }

    routeRequest = fullname;
    try {
      const routesData = await api.routes.getRoutesSegments(state.dongleId, undefined, undefined, undefined, fullname);
      if (routesData.length === 0 && !api.auth.isAuthenticated()) {
        redirectToLogin(getState());
        return;
      }
      dispatch({
        type: Types.ACTION_UPDATE_CURRENT_ROUTE,
        fullname,
        route: routesData.length ? toRoute(routesData[0]) : false,
      });
    } catch (err) {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
    } finally {
      routeRequest = null;
    }
  };
}

export function checkLastRoutesData() {
  return (dispatch, getState) => {
    const { limit, routes, filter } = getState();

    // if current routes are fewer than limit, that means the last fetch already fetched all the routes
    if (routes && routes.length < limit) {
      return
    }

    console.log(`fetching ${limit +LIMIT_INCREMENT } routes`)
    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_LIMIT,
      limit: limit + LIMIT_INCREMENT,
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

// what is on screen only changes by changing the url, see actions/history.js
export function navigate(page, params) {
  return push(urlFor(page, params));
}

// zoom is { start, end } in milliseconds, or null for the whole drive
export function selectRoute(routeId, zoom) {
  return (dispatch, getState) => {
    const state = getState();
    const sameRoute = state.selectedRouteId === routeId;
    const route = sameRoute ? state.currentRoute : (state.routes?.find((r) => r.log_id === routeId) || null);
    const selection = zoom || (route ? { start: 0, end: route.duration } : null);
    if (sameRoute && state.zoom?.start === selection?.start && state.zoom?.end === selection?.end) {
      return;
    }

    dispatch({
      type: Types.ACTION_SELECT_ROUTE,
      routeId,
      route,
      zoom: selection,
    });
    dispatch(resetPlayback());
    dispatch(selectLoop(selection?.start, selection?.end));
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
    let device;
    if (state.devices && state.devices.length > 1) {
      device = state.devices.find((d) => d.dongle_id === dongleId);
    }
    if (!device && state.device && state.device.dongle_id === dongleId) {
      device = state.device;
    }

    // tear down existing webrtc connection
    if (state.dongleId && state.dongleId !== dongleId) {
      webrtcConnectionManager.disconnect();
    }

    dispatch({
      type: Types.ACTION_SELECT_DEVICE,
      dongleId,
    });

    if ((device && !device.shared) || state.profile?.superuser) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    }
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
    dispatch({
      type: Types.ACTION_SELECT_TIME_FILTER,
      start,
      end,
    });

    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_LIMIT,
      limit: LIMIT_INCREMENT,
    })

    dispatch(checkRoutesData());
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
