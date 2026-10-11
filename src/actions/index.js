import { push, replace, goBack } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { athena as Athena } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { deviceUrl, driveUrl, dialogUrl, dialogRules, currentView, withQuery, locationHref } from '../url';
import {hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { hardNavigate } from '../utils/navigation';

const routeRequests = new WeakMap();
const LIMIT_INCREMENT = 5
function routeRequestKey(state) {
  const legacy = state.selection?.legacyRange;
  const logId = state.selectedRouteId;
  const range = legacy || state.filter;

  return JSON.stringify([
    legacy ? 'legacy' : logId ? 'drive' : 'dashboard',
    state.dongleId,
    logId,
    logId ? null : range.start,
    logId ? null : range.end,
    !legacy && !logId ? state.limit : null,
  ]);
}
const currentLocation = (state) => state.router.location;

export function checkRoutesData() {
  return (dispatch, getState) => {
    let state = getState();
    if (!state.dongleId) {
      return;
    }
    const { dongleId, limit: fetchLimit, selectedRouteId: logId, selection } = state;
    const legacy = selection?.legacyRange;
    const fetchRange = legacy || state.filter;
    const kind = legacy ? 'legacy' : logId ? 'drive' : 'dashboard';
    if (!legacy && (logId ? state.routeMetadata[`${dongleId}|${logId}`] || state.routeError : hasRoutesData(state))) return;
    let pending = routeRequests.get(getState);
    if (!pending) {
      pending = new Map();
      routeRequests.set(getState, pending);
    }
    const key = routeRequestKey(state);
    if (pending.has(key)) return pending.get(key);
    const request = logId
      ? api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${logId}`)
      : api.routes.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, legacy ? undefined : fetchLimit);
    const stillRequested = () => routeRequestKey(getState()) === key;
    const promise = request.then((routesData) => {
      state = getState();
      const active = state.selection === selection && stillRequested();
      if (!routesData?.length && !api.auth.isAuthenticated() && active && kind === 'drive') {
        hardNavigate(`/?r=${encodeURIComponent(locationHref(currentLocation(state)))}`);
        return;
      }
      const routes = (routesData || []).map((r) => {
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
      }).sort((a, b) => {
        return b.create_time - a.create_time;
      });

      dispatch({
        type: Types.ACTION_ROUTES_METADATA,
        dongleId,
        start: fetchRange.start,
        end: fetchRange.end,
        routes,
        kind,
        active,
        limit: fetchLimit,
      });

      if (legacy && active && routes.length) {
        const pathname = driveUrl(dongleId, routes[0].log_id);
        dispatch(replace({ ...currentLocation(getState()), pathname }));
      }
      return routes
    }).catch((err) => {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
      if (logId && getState().selection === selection && stillRequested()) {
        dispatch({ type: Types.ACTION_ROUTE_ERROR, error: 'Could not load this drive.' });
      }
    }).finally(() => {
      pending.delete(key);
      // An A → B → A entry can share the pending request, but only a fresh
      // response may establish missing-drive errors or dashboard coverage.
      if (getState().selection !== selection && stillRequested()) dispatch(checkRoutesData());
    });
    pending.set(key, promise);
    return promise
  };
}

export function checkLastRoutesData() {
  return (dispatch, getState) => {
    const { limit, routes } = getState();

    // if current routes are fewer than limit, that means the last fetch already fetched all the routes
    if (routes && routes.length < limit) {
      return
    }

    console.log(`fetching ${limit +LIMIT_INCREMENT } routes`)
    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_LIMIT,
      limit: limit + LIMIT_INCREMENT,
    })

    dispatch(checkRoutesData());
  };
}

// Navigation actions write locations; history reconciliation owns selection.
export function navigate(pathname, replaceEntry = false) {
  return (dispatch, getState) => {
    const location = currentLocation(getState());
    const target = dialogUrl({ ...location, pathname }, null);
    if (location.pathname !== target.pathname || location.search !== target.search) {
      dispatch((replaceEntry ? replace : push)(target));
    }
  };
}

export const openDialog = (dialog, device = null, clip = null) => (dispatch, getState) => {
  const location = currentLocation(getState());
  dispatch(push(dialogUrl(location, dialog, device, clip), { dialogParent: {
    pathname: location.pathname, search: location.search, hash: location.hash,
  } }));
};

function sameLocation(a, b) {
  const first = new URLSearchParams(a.search);
  const second = new URLSearchParams(b.search);
  first.sort(); second.sort();
  return a.pathname === b.pathname && (a.hash || '') === (b.hash || '') && first.toString() === second.toString();
}

export const closeDialog = () => (dispatch, getState) => {
  const location = currentLocation(getState());
  const view = currentView(getState());
  const rule = Object.hasOwn(dialogRules, view.dialog) ? dialogRules[view.dialog] : null;
  const parent = rule?.parent && (!dialogRules[rule.parent].pages || dialogRules[rule.parent].pages.includes(view.page))
    ? rule.parent : null;
  const target = view.dialog === 'pair-result' ? withQuery(location, { dialog: null, device: null, clip: null, pair: null })
    : dialogUrl(location, parent || null, parent ? view.dialogDevice : null);
  const previous = location.state?.dialogParent;
  if (previous && sameLocation(previous, target)) {
    dispatch(goBack());
  } else dispatch(replace(target));
};

export function popTimelineRange(logId) {
  return (dispatch, getState) => {
    const location = currentLocation(getState());
    const previous = location.state?.rangeParent;
    if (previous && previous.pathname.startsWith(`${deviceUrl(getState().dongleId)}/${logId}`)) dispatch(goBack());
    else dispatch(navigate(driveUrl(getState().dongleId, logId), true));
  };
}

export function pushTimelineRange(logId, start, end) {
  return (dispatch, getState) => {
    const state = getState();
    const location = currentLocation(state);
    const route = state.routeMetadata?.[`${state.dongleId}|${logId}`];
    const whole = start == null || end == null || (start === 0 && end === route?.duration);
    const pathname = logId ? driveUrl(state.dongleId, logId, whole ? null : start, whole ? null : end) : deviceUrl(state.dongleId);
    if (location.pathname !== pathname) {
      dispatch(push(dialogUrl({ ...location, pathname }, null), { rangeParent: {
        pathname: location.pathname, search: location.search, hash: location.hash,
      } }));
    }
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
    device ||= getDeviceFromState(state, dongleId);
    profile ||= state.profile;
    if (!device || (!device.is_owner && !profile?.superuser)) return;
    const request = device.prime ? api.billing.getSubscription(dongleId) : api.billing.getSubscribeInfo(dongleId);
    return request.then((result) => dispatch(device.prime
      ? primeGetSubscription(dongleId, result)
      : { type: Types.ACTION_PRIME_SUBSCRIBE_INFO, dongleId, subscribeInfo: result }))
      .catch((err) => {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'actions_fetch_subscription' });
      });
  };
}

export function fetchDeviceOnline(dongleId) {
  return (dispatch) => {
    return api.devices.fetchDevice(dongleId).then((resp) => {
      dispatch({
        type: Types.ACTION_UPDATE_DEVICE_ONLINE,
        dongleId,
        last_athena_ping: resp.last_athena_ping,
        fetched_at: Math.floor(Date.now() / 1000),
      });
    }).catch(console.log);
  };
}

export const selectDevice = (dongleId) => navigate(deviceUrl(dongleId));
export const primeNav = (nav, dongleId = null) => (dispatch, getState) =>
  dispatch(navigate(deviceUrl(dongleId || getState().dongleId, nav ? 'prime' : 'dashboard')));
export const streamNav = (nav) => (dispatch, getState) =>
  dispatch(navigate(deviceUrl(getState().dongleId, nav ? 'stream' : 'dashboard')));

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
    dispatch(push(withQuery(currentLocation(getState()), { from: start, to: end, dialog: null, device: null, clip: null })));
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
