import { push, replace, goBack } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { hardNavigate } from '../utils/navigation';
import { locationFor, parseLocation } from '../url';

const LIMIT_INCREMENT = 5;
const pendingRequests = new WeakMap();
const locationPath = ({ pathname, search = '', hash = '' }) => pathname + search + hash;

function requestOnce(getState, key, request) {
  if (!pendingRequests.has(getState)) pendingRequests.set(getState, new Map());
  const requests = pendingRequests.get(getState);
  if (!requests.has(key)) {
    requests.set(key, Promise.resolve().then(request).finally(() => requests.delete(key)));
  }
  return requests.get(key);
}

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
  }).sort((a, b) => {
    return b.create_time - a.create_time;
  });
}

export function checkRoutesData() {
  return (dispatch, getState) => {
    const state = getState();
    if (!state.dongleId || hasRoutesData(state)) return;
    const { dongleId, filter, limit } = state;
    const key = JSON.stringify(['list', dongleId, filter, limit]);
    return requestOnce(getState, key, async () => {
      try {
        const routesData = await api.routes.getRoutesSegments(dongleId, filter.start, filter.end, limit);
        const current = getState();
        if (current.dongleId !== dongleId || current.limit !== limit
          || current.filter.start !== filter.start || current.filter.end !== filter.end) return;
        dispatch({
          type: Types.ACTION_ROUTES_METADATA, dongleId,
          start: filter.start, end: filter.end, routes: normalizeRoutes(routesData),
        });
      } catch (err) {
        console.error('Failure fetching routes metadata', err);
        Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
      }
    });
  };
}

export function fetchRoute(dongleId, logId) {
  return (dispatch, getState) => {
    if (getState().routeCache[logId]) return;
    return requestOnce(getState, 'drive:' + dongleId + '|' + logId, async () => {
      try {
        const routes = normalizeRoutes(await api.routes.getRoutesSegments(
          dongleId, undefined, undefined, undefined, dongleId + '|' + logId,
        ));
        const route = routes.find((candidate) => candidate.log_id === logId);
        if (route) {
          dispatch({ type: Types.ACTION_ROUTE_METADATA, dongleId, route });
        } else {
          const state = getState();
          if (state.dongleId === dongleId && state.navigation.logId === logId && !api.auth.isAuthenticated()) {
            hardNavigate('/?r=' + encodeURIComponent(locationPath(state.router.location)));
          }
          dispatch({ type: Types.ACTION_ROUTE_ERROR, dongleId, logId, error: 'Route does not exist.' });
        }
      } catch (err) {
        dispatch({ type: Types.ACTION_ROUTE_ERROR, dongleId, logId, error: 'Unable to load this drive.' });
        Sentry.captureException(err, { fingerprint: 'timeline_fetch_route' });
      }
    });
  };
}

export function checkLastRoutesData() {
  return (dispatch, getState) => {
    const { dongleId, limit, routes, filter } = getState();
    if (!dongleId || (routes && routes.length < limit)) return;
    dispatch({ type: Types.ACTION_UPDATE_ROUTE_LIMIT, limit: limit + LIMIT_INCREMENT });
    dispatch({ type: Types.ACTION_SELECT_TIME_FILTER, start: filter.start, end: filter.end });
    return dispatch(checkRoutesData());
  };
}

// Navigation actions only write history. Every location is applied by actions/history.
export function navigate(navigation, replaceEntry = false) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    const next = locationFor(navigation, location);
    if (locationPath(next) !== locationPath(location)) dispatch((replaceEntry ? replace : push)(next));
  };
}

export function selectDevice(dongleId) {
  return navigate({ page: 'device', dongleId });
}

export function pushTimelineRange(logId, start, end) {
  return (dispatch, getState) => {
    const { dongleId, routeCache, routes, navigation, router } = getState();
    const currentRoute = routeCache[logId] || routes?.find((route) => route.log_id === logId);
    const wholeDrive = start == null || end == null || (start === 0 && end === currentRoute?.duration);
    const next = locationFor({
      page: logId ? 'drive' : 'device', dongleId, logId,
      range: wholeDrive ? null : { start, end },
    }, router.location);
    if (locationPath(next) !== locationPath(router.location)) {
      const rangeParent = navigation.page === 'drive' && navigation.logId === logId && !navigation.dialog
        ? locationFor(navigation, router.location) : null;
      dispatch(push({ ...next, state: rangeParent ? { rangeParent } : undefined }));
    }
  };
}

export function popTimelineRange() {
  return (dispatch, getState) => {
    const { navigation, router } = getState();
    if (navigation.page !== 'drive') return;
    const parent = router.location.state?.rangeParent;
    const previous = parent && parseLocation(parent);
    if (previous?.page === 'drive' && previous.dongleId === navigation.dongleId
      && previous.logId === navigation.logId && !previous.dialog) {
      dispatch(goBack());
    } else {
      dispatch(pushTimelineRange(navigation.logId, null, null));
    }
  };
}

export function primeNav(open, dongleId) {
  return (dispatch, getState) => dispatch(navigate({
    page: open ? 'prime' : 'device', dongleId: dongleId || getState().dongleId,
  }));
}

export function streamNav(open) {
  return (dispatch, getState) => dispatch(navigate({
    page: open ? 'stream' : 'device', dongleId: getState().dongleId,
  }));
}

export function openDialog(dialog, { dongleId, clip } = {}) {
  return (dispatch, getState) => {
    const { navigation, router } = getState();
    const next = locationFor({
      ...navigation, dialog, dialogDevice: dongleId || navigation.dongleId, clip,
    }, router.location);
    if (locationPath(next) !== locationPath(router.location)) {
      dispatch(push({ ...next, state: { dialogParent: locationPath(router.location) } }));
    }
  };
}

export function closeDialog(parent = null) {
  return (dispatch, getState) => {
    const { navigation, router } = getState();
    const next = locationFor({ ...navigation, dialog: parent, clip: null }, router.location);
    if (router.location.state?.dialogParent === locationPath(next)) {
      dispatch(goBack());
    } else {
      dispatch(replace(next));
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

    if (!device && state.device && state.device.dongle_id === dongleId) {
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
