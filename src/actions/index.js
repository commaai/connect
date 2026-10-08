import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { parseLocation, pathForState, withFilter, withModal } from '../url';
import { navigate } from './navigation';
import {hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { webrtcConnectionManager } from '../utils/webrtc';
import { hardNavigate } from '../utils/navigation';
import { customFilter } from '../utils/filter';

const routesRequests = new WeakMap();
const sharedDeviceRequests = new WeakMap();
const LIMIT_INCREMENT = 5
const currentUrl = (state) => {
  const { pathname, search = '', hash = '' } = state.router?.location || window.location;
  return `${pathname}${search}${hash}`;
};

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
    const { dongleId, selectedRouteId, limit: fetchLimit, filter: fetchRange } = state;
    const deviceSession = state.deviceSession ?? 0;
    const isDeviceSession = (current) => current.dongleId === dongleId
      && (current.deviceSession ?? 0) === deviceSession;
    let pending = routesRequests.get(getState);
    if (!pending) {
      pending = new Map();
      routesRequests.set(getState, pending);
    }
    const isCurrentRequest = (current) => {
      const page = parseLocation(current.router.location).page;
      return isDeviceSession(current) && current.selectedRouteId === selectedRouteId
        && (selectedRouteId ? page === 'drive' : ['home', 'demo', 'device'].includes(page)
          && current.filter.start === fetchRange.start && current.filter.end === fetchRange.end
          && current.limit === fetchLimit);
    };
    const key = JSON.stringify(selectedRouteId
      ? [deviceSession, dongleId, selectedRouteId]
      : [deviceSession, dongleId, null, fetchRange.start, fetchRange.end, fetchLimit]);
    if (pending.has(key)) return pending.get(key);
    const request = selectedRouteId
      ? api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${selectedRouteId}`)
      : api.routes.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, fetchLimit);

    const promise = request.then((routesData) => {
      state = getState();
      if (!isDeviceSession(state)) return;
      if (!selectedRouteId && (state.filter.start !== fetchRange.start
        || state.filter.end !== fetchRange.end || state.limit !== fetchLimit)) return;
      if (!Array.isArray(routesData)) throw new Error('Route lookup failed');
      if (!routesData.length && !api.auth.isAuthenticated()
        && isCurrentRequest(state)) {
        hardNavigate(`/?r=${encodeURIComponent(currentUrl(state))}`);
        return;
      }

      if (isCurrentRequest(state) && state.navigationError) {
        dispatch({ type: Types.ACTION_NAVIGATION_ERROR, error: null });
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
        selectedRouteId,
        start: fetchRange.start,
        end: fetchRange.end,
        routes,
      });

      return routes;
    }).catch((err) => {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
      const current = getState();
      if (isCurrentRequest(current)) {
        dispatch({ type: Types.ACTION_NAVIGATION_ERROR, error: 'Unable to load drives. Please try again.' });
      }
    }).finally(() => pending.delete(key));

    pending.set(key, promise);
    return promise;
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

// User actions describe a destination. The history middleware alone applies it.
export function pushTimelineRange(log_id, start, end) {
  return (dispatch, getState) => {
    const state = getState();
    const route = state.routeCache?.[log_id] || state.routes?.find((candidate) => candidate.log_id === log_id);
    const wholeDrive = start == null || end == null || (start === 0 && end === route?.duration);
    const zoom = log_id && !wholeDrive ? { start: Math.round(start), end: Math.round(end) } : null;
    if (zoom && zoom.end <= zoom.start) return;
    const pathname = pathForState({
      page: log_id ? 'drive' : 'device', dongleId: state.dongleId,
      selectedRouteId: log_id, zoom,
    });
    const previous = log_id === state.selectedRouteId ? state.zoom : null;
    const filter = parseLocation(state.router?.location).filter || customFilter(state.filter);
    dispatch(navigate({ pathname, ...(filter ? { search: `?from=${filter.start}&to=${filter.end}` } : {}), state: { zoomPrevious: previous } }));
  };
}

export function popTimelineRange(log_id) {
  return (dispatch, getState) => {
    const state = getState();
    const zoom = state.zoom?.previous;
    if (!zoom) return;
    const route = state.currentRoute;
    const wholeDrive = zoom.start === 0 && zoom.end === route?.duration;
    const filter = parseLocation(state.router?.location).filter || customFilter(state.filter);
    dispatch(navigate({
      pathname: pathForState({ page: 'drive', dongleId: state.dongleId, selectedRouteId: log_id, zoom: wholeDrive ? null : zoom }),
      ...(filter ? { search: `?from=${filter.start}&to=${filter.end}` } : {}),
      state: { zoomPrevious: zoom.previous || null },
    }));
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

export function selectDevice(dongleId) {
  return (dispatch, getState) => {
    const state = getState();
    const filter = state.dongleId === dongleId
      ? parseLocation(state.router?.location).filter || customFilter(state.filter) : null;
    dispatch(navigate(pathForState({ page: 'device', dongleId, filter })));
  };
}

// Data selection is separate from navigation, including startup on /referrals.
export function loadDevice(dongleId) {
  return (dispatch, getState) => {
    const state = getState();
    if (state.dongleId === dongleId) return;
    if (state.dongleId) webrtcConnectionManager.disconnect();
    dispatch({ type: Types.ACTION_SELECT_DEVICE, dongleId });
    const device = state.devices?.find((candidate) => candidate.dongle_id === dongleId);
    if (device) {
      dispatch(primeFetchSubscription(dongleId, device));
      if (!device.shared || state.profile?.superuser) dispatch(fetchDeviceOnline(dongleId));
    } else if (dongleId) {
      dispatch(fetchSharedDevice(dongleId));
    }
  };
}

export function primeNav(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) dispatch(navigate(pathForState({ page: nav ? 'prime' : 'device', dongleId })));
  };
}

export function streamNav(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) dispatch(navigate(pathForState({ page: nav ? 'stream' : 'device', dongleId })));
  };
}

export function fetchSharedDevice(dongleId) {
  return async (dispatch, getState) => {
    const state = getState();
    if (state.dongleId !== dongleId) return;
    const deviceSession = state.deviceSession ?? 0;
    const request = {};
    sharedDeviceRequests.set(getState, request);
    const isCurrentRequest = () => {
      const current = getState();
      return current.dongleId === dongleId && (current.deviceSession ?? 0) === deviceSession
        && sharedDeviceRequests.get(getState) === request;
    };
    try {
      const resp = await api.devices.fetchDevice(dongleId);
      if (!isCurrentRequest()) return;
      if (!resp || typeof resp !== 'object' || Array.isArray(resp) || resp.dongle_id !== dongleId) {
        throw new Error('Device lookup failed');
      }
      dispatch({ type: Types.ACTION_DEVICE_ERROR, dongleId, error: null });
      dispatch({
        type: Types.ACTION_UPDATE_SHARED_DEVICE,
        dongleId,
        device: resp,
      });
      dispatch(primeFetchSubscription(dongleId, resp));
    } catch (err) {
      if (!isCurrentRequest()) return;
      const status = err?.resp?.status;
      const error = status === 404 ? 'Device not found.'
        : status === 403 ? 'You do not have access to this device.'
          : 'Unable to load device. Please try again.';
      dispatch({ type: Types.ACTION_DEVICE_ERROR, dongleId, error });
      if (status !== 403) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'action_fetch_shared_device' });
      }
    } finally {
      if (sharedDeviceRequests.get(getState) === request) sharedDeviceRequests.delete(getState);
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
    const location = getState().router.location;
    if (!['home', 'demo', 'device'].includes(parseLocation(location).page)) return;
    dispatch(navigate(withFilter(withModal(location, null), { start, end }), true));
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
