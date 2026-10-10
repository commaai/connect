import { push } from 'connected-react-router';
import { buildLocation } from '../url';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { hardNavigate } from '../utils/navigation';

const routeRequests = new WeakMap();
const LIMIT_INCREMENT = 5;
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

export function checkRoutesData() {
  return (dispatch, getState) => {
    const state = getState();
    if (!state.dongleId || hasRoutesData(state)) return;
    const { dongleId, selectedRouteId: routeId, filter, limit } = state;
    const key = JSON.stringify([dongleId, routeId, filter.start, filter.end, limit]);
    let requests = routeRequests.get(getState);
    if (!requests) {
      requests = new Map();
      routeRequests.set(getState, requests);
    }
    if (requests.has(key)) return requests.get(key);
    const request = routeId
      ? api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${routeId}`)
      : api.routes.getRoutesSegments(dongleId, filter.start, filter.end, limit);
    const promise = request.then((data) => {
      const current = getState();
      // Responses belong to the device, filter, and selection that requested them.
      if (current.dongleId !== dongleId || current.filter.start !== filter.start
        || current.filter.end !== filter.end || current.limit !== limit
        || (routeId && current.selectedRouteId !== routeId)) return;
      if (!data?.length && !api.auth.isAuthenticated()) {
        hardNavigate(`/?r=${encodeURI(currentPathname(current))}`);
        return;
      }
      const routes = normalizeRoutes(data || []);
      dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId, routeId,
        start: filter.start, end: filter.end, routes });
      return routes;
    }).catch((err) => {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
    }).finally(() => requests.delete(key));
    requests.set(key, promise);
    return promise;
  };
}

export function checkLastRoutesData() {
  return (dispatch, getState) => {
    const { limit, routes, filter } = getState();

    // if current routes are fewer than limit, that means the last fetch already fetched all the routes
    if (routes && routes.length < limit) {
      return;
    }

    console.log(`fetching ${limit + LIMIT_INCREMENT} routes`);
    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_LIMIT,
      limit: limit + LIMIT_INCREMENT,
    });

    // invalidate cached routes while keeping the current filter range
    dispatch({
      type: Types.ACTION_SELECT_TIME_FILTER,
      start: filter.start,
      end: filter.end,
    });

    dispatch(checkRoutesData());
  };
}

export function navigate(destination) {
  return (dispatch, getState) => {
    const state = getState();
    const location = typeof destination === 'string' ? destination : buildLocation(destination, state.router.location);
    const current = state.router.location;
    if (typeof location === 'string' ? location !== `${current.pathname}${current.search}${current.hash}`
      : location.pathname !== current.pathname || location.search !== current.search || location.hash !== current.hash) {
      dispatch(push(location));
    }
  };
}

export function pushTimelineRange(routeId, start = null, end = null) {
  return (dispatch, getState) => {
    const state = getState();
    const route = state.currentRoute?.log_id === routeId ? state.currentRoute
      : state.routes?.find((candidate) => candidate.log_id === routeId);
    const wholeDrive = start == null || end == null || (start === 0 && end === route?.duration);
    dispatch(navigate({ page: routeId ? 'drive' : 'dashboard', dongleId: state.dongleId, routeId,
      range: wholeDrive ? null : { start: Math.round(start), end: Math.round(end) } }));
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

    if (device && (device.is_owner || profile?.superuser)) {
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
  return navigate({ page: 'dashboard', dongleId });
}

export function primeNav(open) {
  return (dispatch, getState) => dispatch(navigate({ page: open ? 'prime' : 'dashboard', dongleId: getState().dongleId }));
}

export function streamNav(open) {
  return (dispatch, getState) => dispatch(navigate({ page: open ? 'stream' : 'dashboard', dongleId: getState().dongleId }));
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

export function loadDevice(dongleId) {
  return (dispatch, getState) => {
    const state = getState();
    if (!dongleId || !state.devices) return;
    const device = state.devices.find((candidate) => candidate.dongle_id === dongleId);
    if (device && (!device.shared || state.profile?.superuser)) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    } else {
      dispatch(fetchSharedDevice(dongleId));
    }
    if (device) window.localStorage.setItem('selectedDongleId', dongleId);
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
    });

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
