import * as Sentry from '@sentry/react';
import { createPath } from 'history';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { resetPlayback } from '../timeline/playback';
import { hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { webrtcConnectionManager } from '../utils/webrtc';
import { hardNavigate } from '../utils/navigation';

let routesRequest = null;
const LIMIT_INCREMENT = 5;
const routesRequestKey = (state) => state.selectedRouteId
  ? `${state.dongleId}|route|${state.selectedRouteId}`
  : `${state.dongleId}|list|${state.filter.start}|${state.filter.end}|${state.limit}`;

export function checkRoutesData() {
  return (dispatch, getState) => {
    let state = getState();
    if (!state.dongleId) {
      return;
    }
    const selectedRouteLoaded = state.selectedRouteId
      && (state.currentRoute?.log_id === state.selectedRouteId || state.currentRouteMissing);
    if ((state.selectedRouteId && selectedRouteLoaded) || (!state.selectedRouteId && hasRoutesData(state))) {
      // already has metadata, don't bother
      return;
    }
    const requestKey = routesRequestKey(state);
    if (routesRequest?.key === requestKey) {
      // the exact request is already pending
      return routesRequest.promise;
    }
    console.debug('We need to update the segment metadata...');
    const { dongleId, limit: fetchLimit, selectedRouteId } = state;
    const fetchRange = state.filter;

    const request = { key: requestKey };
    routesRequest = request;
    request.promise = (selectedRouteId
      ? api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${selectedRouteId}`)
      : api.routes.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, fetchLimit)
    ).then((routesData) => {
      if (routesRequest !== request) {
        return;
      }
      state = getState();
      if (routesRequestKey(state) !== requestKey) {
        routesRequest = null;
        dispatch(checkRoutesData());
        return;
      }
      if (routesData && routesData.length === 0
        && !api.auth.isAuthenticated()) {
        routesRequest = null;
        const returnTo = createPath(state.router?.location || window.location);
        hardNavigate(`/?r=${encodeURIComponent(returnTo)}`); // redirect to login
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

      if (selectedRouteId) {
        dispatch({
          type: Types.ACTION_CURRENT_ROUTE,
          logId: selectedRouteId,
          route: routes[0] || null,
        });
      } else {
        dispatch({
          type: Types.ACTION_ROUTES_METADATA,
          dongleId,
          start: fetchRange.start,
          end: fetchRange.end,
          routes,
        });
      }

      routesRequest = null;

      return routes;
    }).catch((err) => {
      if (routesRequest !== request) {
        return;
      }
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
      const requestIsStale = routesRequestKey(getState()) !== requestKey;
      routesRequest = null;
      if (requestIsStale) {
        dispatch(checkRoutesData());
      }
    });

    return request.promise;
  };
}

export function checkLastRoutesData() {
  return (dispatch, getState) => {
    const state = getState();
    const { limit, routes, filter } = state;
    const routesLoaded = hasRoutesData(state);

    // if current routes are fewer than limit, that means the last fetch already fetched all the routes
    if (routesLoaded && routes.length < limit) {
      return;
    }

    const nextLimit = routesLoaded ? limit + LIMIT_INCREMENT : Math.max(limit, LIMIT_INCREMENT);
    console.log(`fetching ${nextLimit} routes`);
    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_LIMIT,
      limit: nextLimit,
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

export function selectTimelineRange(log_id, start, end) {
  return (dispatch, getState) => {
    const state = getState();
    const currentRoute = state.routes?.find((route) => route.log_id === log_id)
      || (state.currentRoute?.log_id === log_id ? state.currentRoute : null);
    const wholeDrive = log_id && start == null && end == null;
    const targetStart = wholeDrive && currentRoute ? 0 : start;
    const targetEnd = wholeDrive && currentRoute ? currentRoute.duration : end;
    const selectionMatches = targetStart === state.zoom?.start && targetEnd === state.zoom?.end;
    const loopMatches = targetStart == null
      || (state.loop?.startTime === targetStart && state.loop?.duration === targetEnd - targetStart);
    const resetRequired = log_id
      && (state.selectedRouteId !== log_id || (targetStart != null && !loopMatches));
    if (state.selectedRouteId === log_id
      && ((selectionMatches && loopMatches) || (!log_id && !state.zoom))) {
      return;
    }

    dispatch({
      type: Types.TIMELINE_PUSH_SELECTION,
      log_id,
      start,
      end,
    });

    if (resetRequired) {
      dispatch(resetPlayback());
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

export function selectDeviceState(dongleId) {
  return (dispatch, getState) => {
    const state = getState();
    const device = getDeviceFromState(state, dongleId);

    // tear down existing webrtc connection
    if (state.dongleId && state.dongleId !== dongleId) {
      webrtcConnectionManager.disconnect();
    }

    dispatch({
      type: Types.ACTION_SELECT_DEVICE,
      dongleId,
    });

    if (Array.isArray(state.devices) && !device) {
      dispatch(fetchSharedDevice(dongleId));
    } else if ((device && !device.shared) || state.profile?.superuser) {
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
