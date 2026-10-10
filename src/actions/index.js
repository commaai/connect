import { push, replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { buildUrl, ROUTES } from '../url';
import {hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { hardNavigate } from '../utils/navigation';

const routeRequests = new WeakMap();
const LIMIT_INCREMENT = 5
const currentPathname = (state) => state.router?.location?.pathname || window.location.pathname;

export function checkRoutesData() {
  return (dispatch, getState) => {
    let state = getState();
    if (!state.dongleId || state.devices === null) {
      return;
    }
    if (hasRoutesData(state)) {
      // already has metadata, don't bother
      return;
    }
    const { dongleId, selectedRouteId: logId, limit: fetchLimit, navigationId } = state;
    const fetchRange = state.filter;
    const key = JSON.stringify([dongleId, logId, fetchLimit, fetchRange, navigationId]);
    const pending = routeRequests.get(getState);
    if (pending?.key === key) return pending.promise;
    const request = { key };
    routeRequests.set(getState, request);
    const req = logId
      ? api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${logId}`)
      : api.routes.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, fetchLimit);
    request.promise = req.then((routesData) => {
      state = getState();
      if (state.navigationId !== navigationId || state.dongleId !== dongleId
        || state.selectedRouteId !== logId || state.limit !== fetchLimit
        || state.filter.start !== fetchRange.start || state.filter.end !== fetchRange.end) return;
      if (!routesData) return;
      if (!routesData.length && !api.auth.isAuthenticated()) {
        const location = state.router?.location;
        hardNavigate(`/?r=${encodeURIComponent((location?.pathname || currentPathname(state)) + (location?.search || ''))}`);
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
        logId,
        start: fetchRange.start,
        end: fetchRange.end,
        routes,
      });

      return routes
    }).catch((err) => {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
    }).finally(() => {
      if (routeRequests.get(getState) === request) routeRequests.delete(getState);
    });

    return request.promise
  };
}

export function checkLastRoutesData() {
  return (dispatch, getState) => {
    const { limit, routes, filter, dashboardRouteIds } = getState();

    // if current routes are fewer than limit, that means the last fetch already fetched all the routes
    if (routes && (dashboardRouteIds?.length ?? routes.length) < limit) {
      return
    }

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

export function urlForState(dongleId, logId, start, end, prime) {
  return buildUrl({ dongleId, logId, type: prime ? ROUTES.PRIME : ROUTES.DEVICE,
    zoom: start != null && end != null ? { start: start * 1000, end: end * 1000 } : null });
}

export function pushTimelineRange(logId, start, end) {
  return (dispatch, getState) => {
    const state = getState();
    const route = state.routes?.find((r) => r.log_id === logId);
    const wholeDrive = start == null || end == null || (start === 0 && end === route?.duration);
    const desiredPath = buildUrl({ dongleId: state.dongleId, logId,
      zoom: wholeDrive ? null : { start, end } });
    if (currentPathname(state) !== desiredPath) {
      dispatch(push(desiredPath, { previousZoom: !wholeDrive && state.selectedRouteId === logId ? state.zoom : null }));
    }
  };
}

export function popTimelineRange(logId) {
  return (dispatch, getState) => {
    const { dongleId, zoom, currentRoute } = getState();
    const previous = zoom?.previous;
    const wholeDrive = previous?.start === 0 && previous?.end === currentRoute?.duration;
    dispatch(push(buildUrl({ dongleId, logId, zoom: wholeDrive ? null : previous }), { previousZoom: previous?.previous || null }));
  };
}

// Modal query parameters retain the underlying drive/range and payment parameters.
export function modalNav(modal, device) {
  return (dispatch, getState) => {
    const { location } = getState().router;
    const query = new URLSearchParams(location.search);
    if (modal) query.set('modal', modal);
    else query.delete('modal');
    if (device) query.set('device', device);
    else if (!modal) query.delete('device');
    dispatch((modal ? push : replace)({ ...location, search: query.toString() ? `?${query}` : '' }));
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

    const generation = state.deviceGeneration;
    const isCurrent = () => getState().deviceGeneration === generation && getState().dongleId === dongleId;
    if (device && (device.is_owner || profile?.superuser)) {
      if (device.prime) {
        Billing.getSubscription(dongleId).then((subscription) => {
          if (!isCurrent()) return;
          dispatch(primeGetSubscription(dongleId, subscription));
        }).catch((err) => {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'actions_fetch_subscription' });
        });
      } else {
        Billing.getSubscribeInfo(dongleId).then((subscribeInfo) => {
          if (!isCurrent()) return;
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
  return (dispatch, getState) => {
    const generation = getState().deviceGeneration;
    api.devices.fetchDevice(dongleId).then((resp) => {
      if (generation !== getState().deviceGeneration || dongleId !== getState().dongleId) return;
      dispatch({
        type: Types.ACTION_UPDATE_DEVICE_ONLINE,
        dongleId,
        last_athena_ping: resp.last_athena_ping,
        fetched_at: Math.floor(Date.now() / 1000),
      });
    }).catch((err) => Sentry.captureException(err, { fingerprint: 'fetch_device_online' }));
  };
}

export function selectDevice(dongleId) {
  return push(buildUrl({ dongleId }));
}

export function primeNav(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) dispatch(push(buildUrl({ dongleId, type: nav ? ROUTES.PRIME : ROUTES.DEVICE })));
  };
}

export function streamNav(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) dispatch(push(buildUrl({ dongleId, type: nav ? ROUTES.STREAM : ROUTES.DEVICE })));
  };
}

export function fetchSharedDevice(dongleId) {
  return async (dispatch, getState) => {
    const generation = getState().deviceGeneration;
    try {
      const resp = await api.devices.fetchDevice(dongleId);
      if (generation !== getState().deviceGeneration || dongleId !== getState().dongleId) return;
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
