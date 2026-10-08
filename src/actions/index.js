import { push } from 'connected-react-router';
import { drivePath, modalLocation } from '../url';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { resetPlayback, selectLoop } from '../timeline/playback';
import {hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { webrtcConnectionManager } from '../utils/webrtc';
import { hardNavigate } from '../utils/navigation';

const routeRequests = new WeakMap();
const LIMIT_INCREMENT = 5
const currentPathname = (state) => state.router?.location?.pathname || window.location.pathname;

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
    const key = JSON.stringify([state.dongleId, state.selectedRouteId, state.filter, state.limit]);
    const pending = routeRequests.get(getState);
    if (pending?.key === key) return pending.promise;
    console.debug('We need to update the segment metadata...');
    const { dongleId, limit: fetchLimit, selectedRouteId } = state;
    const request = { key };
    const fetchRange = state.filter;

    // if requested segment range not in loaded routes, fetch it explicitly
    if (state.selectedRouteId) {
      request.req =
        api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${selectedRouteId}`);
    } else {
      request.req =
        api.routes.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, fetchLimit);
    }

    routeRequests.set(getState, request);
    request.promise = request.req.then((routesData) => {
      if (routeRequests.get(getState) !== request) return;
      state = getState();
      const currentRange = state.filter;
      if (currentRange.start !== fetchRange.start
        || currentRange.end !== fetchRange.end
        || state.limit !== fetchLimit
        || state.dongleId !== dongleId
        || state.selectedRouteId !== selectedRouteId) {
        routeRequests.delete(getState);
        dispatch(checkRoutesData());
        return;
      }
      if (routesData && routesData.length === 0
        && !api.auth.isAuthenticated()) {
        routeRequests.delete(getState);
        hardNavigate(`/?r=${encodeURI(currentPathname(state))}`); // redirect to login
        return;
      }

      if (!Array.isArray(routesData)) {
        routeRequests.delete(getState);
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
        routeId: selectedRouteId,
        routes,
      });

      if (routeRequests.get(getState) === request) routeRequests.delete(getState);

      return routes
    }).catch((err) => {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
      if (routeRequests.get(getState) === request) routeRequests.delete(getState);
    });

    return request.promise
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

export function urlForState(dongleId, log_id, start, end, prime) {
  return prime && !log_id ? `/${dongleId}/prime`
    : drivePath(dongleId, log_id, start == null ? null : start * 1000, end == null ? null : end * 1000);
}

export function setModal(modal, dongleId) {
  return (dispatch, getState) => {
    const state = getState();
    const location = state.router.location;
    const background = dongleId && dongleId !== state.dongleId
      ? { pathname: drivePath(dongleId), search: '', hash: '' } : location;
    dispatch(push(modalLocation(background, modal)));
  };
}

function updateTimeline(state, dispatch, log_id, start, end) {
  if (state.selectedRouteId !== log_id || state.loop?.startTime !== start || state.loop?.duration !== end - start) {
    dispatch(resetPlayback());
    dispatch(selectLoop(start, end));
  }
}

export function popTimelineRange() {
  return (dispatch, getState) => {
    const { zoom } = getState();
    const previous = zoom?.previous;
    if (previous) {
      const state = getState();
      const route = state.currentRoute;
      const wholeDrive = previous.start === 0 && previous.end === route?.duration;
      dispatch(push({
        pathname: drivePath(state.dongleId, state.selectedRouteId, wholeDrive ? null : previous.start, wholeDrive ? null : previous.end),
        state: { previousZoom: previous.previous || null },
      }));
    }
  };
}

export function pushTimelineRange(log_id, start, end, allowPathChange = true, previousZoom) {
  return (dispatch, getState) => {
    const state = getState();
    if (allowPathChange) {
      const route = state.routes?.find((candidate) => candidate.log_id === log_id);
      const wholeDrive = start == null || end == null || (start === 0 && end === route?.duration);
      const desiredPath = drivePath(state.dongleId, log_id, wholeDrive ? null : start, wholeDrive ? null : end);
      if (currentPathname(state) !== desiredPath || state.router?.location?.search) dispatch(push({
        pathname: desiredPath, state: { previousZoom: state.selectedRouteId === log_id ? state.zoom : null },
      }));
      return;
    }
    dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id, start, end, previousZoom });
    const selected = getState();
    if (log_id && selected.zoom) updateTimeline(state, dispatch, log_id, selected.zoom.start, selected.zoom.end);
    else dispatch(resetPlayback());
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

export function selectDevice(dongleId, allowPathChange = true, fetchRoutes = true) {
  return (dispatch, getState) => {
    const state = getState();
    if (allowPathChange) {
      const pathname = drivePath(dongleId);
      if (currentPathname(state) !== pathname || state.router?.location?.search) dispatch(push(pathname));
      return;
    }
    if (state.dongleId === dongleId) return;
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

    if (fetchRoutes) {
      dispatch(checkLastRoutesData());
    }
  };
}

export function primeNav(nav, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();
    if (!state.dongleId) return;
    if (allowPathChange) {
      const desiredPath = nav ? `/${state.dongleId}/prime` : `/${state.dongleId}`;
      if (currentPathname(state) !== desiredPath || state.router?.location?.search) dispatch(push(desiredPath));
    } else if (state.primeNav !== nav) {
      dispatch({ type: Types.ACTION_PRIME_NAV, primeNav: nav });
    }
  };
}

export function streamNav(nav, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();
    if (!state.dongleId) return;
    if (allowPathChange) {
      const desiredPath = nav ? `/${state.dongleId}/stream` : `/${state.dongleId}`;
      if (currentPathname(state) !== desiredPath || state.router?.location?.search) dispatch(push(desiredPath));
    } else if (state.streamNav !== nav) {
      dispatch({ type: Types.ACTION_STREAM_NAV, streamNav: nav });
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
