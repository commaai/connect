import { athena as Athena, billing as Billing, devices as Devices, drives as Drives } from '@commaai/api';
import MyCommaAuth from '@commaai/my-comma-auth';
import * as Sentry from '@sentry/react';
import { navigate } from '../navigation';
import { selectSegmentRange } from '../selectors/route';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { hasRoutesData } from '../timeline/segments';
import { deviceVersionAtLeast, getDeviceFromState } from '../utils';
import * as Types from './types';

let routesRequest = null;
let routesRequestPromise = null;
const LIMIT_INCREMENT = 5;
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
    const { dongleId } = state;
    const fetchRange = state.filter;

    // Use a minimum limit to ensure we always fetch at least some routes
    const limit = state.limit || LIMIT_INCREMENT;

    // if requested segment range (from URL) not in loaded routes, fetch it explicitly
    const urlSeg = selectSegmentRange();
    if (urlSeg) {
      routesRequest = {
        req: Drives.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${urlSeg.log_id}`),
        dongleId,
      };
    } else {
      routesRequest = {
        req: Drives.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, limit),
        dongleId,
      };
    }

    routesRequestPromise = routesRequest.req
      .then((routesData) => {
        state = getState();
        const currentRange = state.filter;
        if (currentRange.start !== fetchRange.start || currentRange.end !== fetchRange.end || state.dongleId !== dongleId) {
          routesRequest = null;
          dispatch(checkRoutesData());
          return;
        }
        if (routesData && routesData.length === 0 && !MyCommaAuth.isAuthenticated()) {
          window.location = `/?r=${encodeURI(window.location.pathname)}`; // redirect to login
          return;
        }

        const routes = routesData
          .map((r) => {
            let startTime = r.segment_start_times[0];
            let endTime = r.segment_end_times[r.segment_end_times.length - 1];

            // TODO: these will all be relative times soon
            // fix segment boundary times for routes that have the wrong time at the start
            if (Math.abs(r.start_time_utc_millis - startTime) > 24 * 60 * 60 * 1000 && Math.abs(r.end_time_utc_millis - endTime) < 10 * 1000) {
              startTime = r.start_time_utc_millis;
              endTime = r.end_time_utc_millis;
              r.segment_start_times = r.segment_numbers.map((x) => startTime + x * 60 * 1000);
              r.segment_end_times = r.segment_numbers.map((x) => Math.min(startTime + (x + 1) * 60 * 1000, endTime));
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
          })
          .sort((a, b) => {
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

        return routes;
      })
      .catch((err) => {
        console.error('Failure fetching routes metadata', err);
        Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
        routesRequest = null;
      });

    return routesRequestPromise;
  };
}

export function checkLastRoutesData() {
  return (dispatch, getState) => {
    const limit = getState().limit;
    const routes = getState().routes;

    // if current routes are fewer than limit, that means the last fetch already fetched all the routes
    if (routes && routes.length < limit) {
      return;
    }

    console.log(`fetching ${limit + LIMIT_INCREMENT} routes`);
    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_LIMIT,
      limit: limit + LIMIT_INCREMENT,
    });

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

export function urlForState(dongleId, log_id, start, end) {
  const path = [dongleId];

  if (log_id) {
    path.push(log_id);
    if (start && end && start > 0) {
      path.push(start);
      path.push(end);
    }
  }

  return `/${path.join('/')}`;
}

function _updateTimeline(state, dispatch, log_id, start, end, allowPathChange) {
  if (
    !state.loop ||
    !state.loop.startTime ||
    !state.loop.duration ||
    state.loop.startTime < start ||
    state.loop.startTime + state.loop.duration > end ||
    state.loop.duration < end - start
  ) {
    dispatch(resetPlayback());
    dispatch(selectLoop(start, end));
  }

  if (allowPathChange) {
    const desiredPath = urlForState(state.dongleId, log_id, Math.floor(start / 1000), Math.floor(end / 1000));
    if (window.location.pathname !== desiredPath) {
      navigate(desiredPath);
    }
  }
}

export function popTimelineRange(log_id, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();
    if (allowPathChange && state.dongleId) {
      navigate(`/${state.dongleId}/${log_id || ''}`.replace(/\/$/, ''));
    }
  };
}

export function pushTimelineRange(log_id, start, end, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();
    if (allowPathChange && state.dongleId) {
      const desiredPath = urlForState(state.dongleId, log_id, Math.floor((start || 0) / 1000), Math.floor((end || 0) / 1000));
      if (window.location.pathname !== desiredPath) {
        navigate(desiredPath);
      }
    }
    // update loop to reflect new selection
    if (start != null && end != null) {
      dispatch(resetPlayback());
      dispatch(selectLoop(start, end));
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
        Billing.getSubscription(dongleId)
          .then((subscription) => {
            dispatch(primeGetSubscription(dongleId, subscription));
          })
          .catch((err) => {
            console.error(err);
            Sentry.captureException(err, { fingerprint: 'actions_fetch_subscription' });
          });
      } else {
        Billing.getSubscribeInfo(dongleId)
          .then((subscribeInfo) => {
            dispatch({
              type: Types.ACTION_PRIME_SUBSCRIBE_INFO,
              dongleId,
              subscribeInfo,
            });
          })
          .catch((err) => {
            console.error(err);
            Sentry.captureException(err, { fingerprint: 'actions_fetch_subscribe_info' });
          });
      }
    }
  };
}

export function fetchDeviceOnline(dongleId) {
  return (dispatch) => {
    Devices.fetchDevice(dongleId)
      .then((resp) => {
        dispatch({
          type: Types.ACTION_UPDATE_DEVICE_ONLINE,
          dongleId,
          last_athena_ping: resp.last_athena_ping,
          fetched_at: Math.floor(Date.now() / 1000),
        });
      })
      .catch(console.log);
  };
}

// segment range is derived from URL; no update action needed

export function selectDevice(dongleId, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();
    let device;
    if (state.devices && state.devices.length > 1) {
      device = state.devices.find((d) => d.dongle_id === dongleId);
    }
    if (!device && state.device && state.device.dongle_id === dongleId) {
      device = state.device;
    }

    dispatch({
      type: Types.ACTION_SELECT_DEVICE,
      dongleId,
    });

    // Don't clear routes immediately - let them persist while new routes load
    // This prevents flashing when switching devices since routes-based conditional rendering
    // won't unmount components during the async data fetch
    // dispatch(pushTimelineRange(null, null, null, false));

    if ((device && !device.shared) || state.profile?.superuser) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    }

    dispatch(checkRoutesData());

    if (allowPathChange) {
      const desiredPath = urlForState(dongleId, null, null, null);
      if (window.location.pathname !== desiredPath) {
        navigate(desiredPath);
      }
    }
  };
}

// prime view is now derived from URL

export function fetchSharedDevice(dongleId) {
  return async (dispatch) => {
    try {
      const resp = await Devices.fetchDevice(dongleId);
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
