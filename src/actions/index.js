import { push } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import document from 'global/document';
import { billing as Billing, devices as DevicesApi, drives as DrivesApi, athena as AthenaApi } from '@commaai/comma-api';
import MyCommaAuth from '@commaai/my-comma-auth';

import * as Types from './types';
import { resetPlayback, selectLoop } from '../timeline/playback'
import { getSegmentFetchRange, hasRoutesData } from '../timeline/segments';
import { getClipsNav } from '../url';
import { getDeviceFromState, deviceVersionAtLeast } from '../utils';

let routesRequest = null;

export function selectRange(start, end, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();
    if (state.zoom?.start !== start || state.zoom?.end !== end) {
      dispatch({
        type: Types.TIMELINE_SELECTION_CHANGED,
        start,
        end
      });
    }

    dispatch(checkRoutesData());

    if (!state.loop || !state.loop.startTime || !state.loop.duration || state.loop.startTime < start ||
      state.loop.startTime + state.loop.duration > end || state.loop.duration < end - start)
    {
      dispatch(resetPlayback());
      dispatch(selectLoop(start, end));
    }

    if (allowPathChange) {
      const desiredPath = urlForState(state.dongleId, start, end, false);
      if (window.location.pathname !== desiredPath) {
        dispatch(push(desiredPath));
      }
    }
  };
}

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

    dispatch(selectRange(null, null, false))
    if ((device && !device.shared) || state.profile?.superuser) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    }

    dispatch(checkRoutesData());

    if (allowPathChange) {
      const desiredPath = urlForState(dongleId, null, null, null);
      if (window.location.pathname !== desiredPath) {
        dispatch(push(desiredPath));
      }
    }
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

export function primeNav(nav, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();
    if (!state.dongleId) {
      return;
    }

    if (state.primeNav != nav) {
      dispatch({
        type: Types.ACTION_PRIME_NAV,
        primeNav: nav,
      });
    }

    if (allowPathChange) {
      const curPath = document.location.pathname;
      const desiredPath = urlForState(state.dongleId, null, null, nav);
      if (curPath !== desiredPath) {
        dispatch(push(desiredPath));
      }
    }
  };
}

export function fetchSharedDevice(dongleId) {
  return async (dispatch, getState) => {
    try {
      const resp = await DevicesApi.fetchDevice(dongleId);
      dispatch({
        type: Types.ACTION_UPDATE_SHARED_DEVICE,
        dongleId,
        device: resp,
      });
    } catch(err) {
      if (!err.resp || err.resp.status !== 403) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'action_fetch_shared_device' });
      }
    }
  };
}

export function fetchDeviceOnline(dongleId) {
  return (dispatch, getState) => {
    DevicesApi.fetchDevice(dongleId).then((resp) => {
      dispatch({
        type: Types.ACTION_UPDATE_DEVICE_ONLINE,
        dongleId: dongleId,
        last_athena_ping: resp.last_athena_ping,
        fetched_at: parseInt(Date.now() / 1000),
      });
    }).catch(console.log);
  };
}

export function updateDeviceOnline(dongleId, last_athena_ping) {
  return (dispatch, getState) => {
    dispatch({
      type: Types.ACTION_UPDATE_DEVICE_ONLINE,
      dongleId: dongleId,
      last_athena_ping,
      fetched_at: parseInt(Date.now() / 1000),
    });
  };
}

export function fetchDeviceNetworkStatus(dongleId) {
  return async (dispatch, getState) => {
    const device = getDeviceFromState(getState(), dongleId);
    if (deviceVersionAtLeast(device, "0.8.14")) {
      const payload = {
        id: 0,
        jsonrpc: "2.0",
        method: "getNetworkMetered",
      };
      try {
        const resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
        if (resp && resp.result !== undefined) {
          dispatch({
            type: Types.ACTION_UPDATE_DEVICE_NETWORK,
            dongleId,
            networkMetered: resp.result,
          });
          dispatch(updateDeviceOnline(dongleId, parseInt(Date.now() / 1000)));
        }
      } catch(err) {
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
        jsonrpc: "2.0",
        method: "getNetworkType",
      };
      try {
        const resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
        if (resp && resp.result !== undefined) {
          const metered = resp.result !== 1 && resp.result !== 6; // wifi or ethernet
          dispatch({
            type: Types.ACTION_UPDATE_DEVICE_NETWORK,
            dongleId,
            networkMetered: metered,
          });
          dispatch(updateDeviceOnline(dongleId, parseInt(Date.now() / 1000)));
        }
      } catch(err) {
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
      return;
    }
    console.log('We need to update the segment metadata...');
    const { dongleId } = state;
    const fetchRange = getSegmentFetchRange(state);

    routesRequest = {
      req: DrivesApi.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end),
      dongleId: dongleId,
    };

    routesRequest.req.then((routesData) => {
      state = getState();
      const currFetchRange = getSegmentFetchRange(state);
      if (currFetchRange.start !== fetchRange.start || currFetchRange.end !== fetchRange.end || state.dongleId !== dongleId) {
        routesRequest = null;
        dispatch(checkRoutesData());
        return;
      } else if (routesData && routesData.length === 0 && !MyCommaAuth.isAuthenticated() &&
        !getClipsNav(window.location.pathname)?.clip_id)
      {
        window.location = `/?r=${encodeURI(window.location.pathname)}`;  // redirect to login
        return;
      }

      const routes = routesData.map((r) => {
        const start_time = r.segment_start_times[0];
        const end_time = r.segment_end_times[r.segment_end_times.length - 1];
        return {
          ...r,
          url: r.url.replace('chffrprivate.blob.core.windows.net', 'chffrprivate.azureedge.net'),
          offset: Math.round(start_time) - state.filter.start,
          duration: end_time - start_time,
          start_time_utc_millis: start_time,
          end_time_utc_millis: end_time,
          segment_offsets: r.segment_start_times.map((x) => x - state.filter.start),
        };
      });

      dispatch({
        type: Types.ACTION_ROUTES_METADATA,
        dongleId: dongleId,
        start: fetchRange.start,
        end: fetchRange.end,
        routes: routes,
      });

      routesRequest = null;
    }).catch((err) => {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
      routesRequest = null;
    });
  }
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
      end
    });

    dispatch(checkRoutesData());
  }
}

export function primeGetSubscription(dongleId, subscription) {
  return {
    type: Types.ACTION_PRIME_SUBSCRIPTION,
    dongleId,
    subscription,
  };
}

export function urlForState(dongleId, start, end, prime_nav) {
  const path = [dongleId];

  if (start && end) {
    path.push(start);
    path.push(end);
  } else if (prime_nav) {
    path.push('prime');
  }

  return `/${path.join('/')}`;
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
