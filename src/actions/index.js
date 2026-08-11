import { push } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing, devices as Devices, drives as Drives } from '../api';
import MyCommaAuth from '@commaai/my-comma-auth';

import * as Types from './types';
import { resetPlayback, selectLoop } from '../timeline/playback';
import {hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { webrtcConnectionManager } from '../utils/webrtc';
import { urlForDestination } from '../url';

export const disconnectWebrtc = () => webrtcConnectionManager.disconnect();

let routesRequest = null;
let routesRequestPromise = null;
const LIMIT_INCREMENT = 5
const FIVE_YEARS = 1000 * 60 * 60 * 24 * 365 * 5;

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
    const { dongleId } = state;
    const fetchRange = state.filter;

    // if requested segment range not in loaded routes, fetch it explicitly
    if (state.segmentRange) {
      routesRequest = {
        req: Drives.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${state.segmentRange.log_id}`),
        dongleId,
      };
    } else {
      routesRequest = {
        req: Drives.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, state.limit),
        dongleId,
      };
    }

    routesRequestPromise = routesRequest.req.then((routesData) => {
      state = getState();
      const currentRange = state.filter;
      if (currentRange.start !== fetchRange.start
        || currentRange.end !== fetchRange.end
        || state.dongleId !== dongleId) {
        routesRequest = null;
        dispatch(checkRoutesData());
        return;
      }
      if (routesData && routesData.length === 0
        && !MyCommaAuth.isAuthenticated()) {
        window.location = `/?r=${encodeURI(window.location.pathname)}`; // redirect to login
        return;
      }

      const routes = routesData.map((r) => {
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

export function checkLastRoutesData() {
  return (dispatch, getState) => {
    const limit = getState().limit
    const routes = getState().routes

    // if current routes are fewer than limit, that means the last fetch already fetched all the routes
    if (routes && routes.length < limit) {
      return
    }

    console.log(`fetching ${limit +LIMIT_INCREMENT } routes`)
    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_LIMIT,
      limit: limit + LIMIT_INCREMENT,
    })

    const d = new Date();
    const end = d.getTime();
    const start = end - FIVE_YEARS;

    dispatch({
      type: Types.ACTION_SELECT_TIME_FILTER,
      start,
      end,
    });

    dispatch(checkRoutesData());
  };
}

function updateTimeline(state, dispatch, log_id, start, end, allowPathChange) {
  if (!state.loop || !state.loop.startTime || !state.loop.duration || state.loop.startTime < start
    || state.loop.startTime + state.loop.duration > end || state.loop.duration < end - start) {
    dispatch(resetPlayback());
    dispatch(selectLoop(start, end));
  }

  if (allowPathChange) {
    const range = start >= 1000 && end != null ? { start, end } : { start: null, end: null };
    const desiredPath = urlForDestination({
      dongleId: state.dongleId,
      page: 'drive',
      drive: { logId: log_id, ...range },
    });
    if (window.location.pathname !== desiredPath) {
      dispatch(push(desiredPath));
    }
  }
}

export function popTimelineRange(log_id, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();
    if (state.zoom.previous) {
      dispatch({
        type: Types.TIMELINE_POP_SELECTION,
      });

      const { start, end } = state.zoom.previous;
      updateTimeline(state, dispatch, log_id, start, end, allowPathChange);
    }
  };
}

export function pushTimelineRange(log_id, start, end, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();

    if (allowPathChange) {
      const range = start >= 1000 && end != null ? { start, end } : { start: null, end: null };
      const desiredPath = urlForDestination({
        dongleId: state.dongleId,
        page: log_id ? 'drive' : 'dashboard',
        drive: log_id ? { logId: log_id, ...range } : null,
      });
      if (window.location.pathname !== desiredPath) dispatch(push(desiredPath));
      return;
    }

    if (state.zoom?.start !== start || state.zoom?.end !== end || state.segmentRange?.log_id !== log_id) {
      dispatch({
        type: Types.TIMELINE_PUSH_SELECTION,
        log_id,
        start,
        end,
      });
    }

    updateTimeline(state, dispatch, log_id, start, end, allowPathChange);
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
    Devices.fetchDevice(dongleId).then((resp) => {
      dispatch({
        type: Types.ACTION_UPDATE_DEVICE_ONLINE,
        dongleId,
        last_athena_ping: resp.last_athena_ping,
        fetched_at: Math.floor(Date.now() / 1000),
      });
    }).catch(console.log);
  };
}

export const selectDevice = (dongleId) => (dispatch) => {
  const pathname = urlForDestination({ dongleId, page: 'dashboard', drive: null });
  if (window.location.pathname !== pathname) dispatch(push(pathname));
};

export function primeNav(nav) {
  return (dispatch, getState) => {
    const state = getState();
    const pathname = state.dongleId && urlForDestination({
      dongleId: state.dongleId,
      page: nav ? 'prime' : 'dashboard',
      drive: null,
    });
    if (pathname && window.location.pathname !== pathname) dispatch(push(pathname));
  };
}

export function streamNav(nav) {
  return (dispatch, getState) => {
    const state = getState();
    const pathname = state.dongleId && urlForDestination({
      dongleId: state.dongleId,
      page: nav ? 'stream' : 'dashboard',
      drive: null,
    });
    if (pathname && window.location.pathname !== pathname) dispatch(push(pathname));
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
      limit: undefined,
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
