import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { hardNavigate } from '../utils/navigation';
import { urlOfRouterLocation } from '../routing/codec';
import { selectSelectedRouteId } from '../routing/selectors';
import { fallbackServices } from '../routing/services';

const LIMIT_INCREMENT = 5

function normalizeRoute(r) {
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
}

// What the active routes view still needs: nothing, the selected drive's
// detail (the list is loaded but doesn't contain it), or the list itself
// (fetched by route when a drive is selected, as on a cold drive link).
function routesNeed(state) {
  const selectedRouteId = selectSelectedRouteId(state);
  const selectedKnown = !selectedRouteId
    || state.routes?.some((route) => route.log_id === selectedRouteId)
    || state.missingRoute === `${state.dongleId}|${selectedRouteId}`;
  if (hasRoutesData(state)) return selectedKnown ? null : 'detail';
  return 'list';
}

// The view a routes request serves: everything that determines its result.
function routesViewKey(state) {
  return JSON.stringify([
    state.dongleId, selectSelectedRouteId(state), state.filter.start, state.filter.end, state.limit,
  ]);
}

// A request's identity: its view and what that view still needed.
function routesRequestKey(state) {
  return JSON.stringify([routesViewKey(state), routesNeed(state)]);
}

export function checkRoutesData() {
  return (dispatch, getState, services = fallbackServices) => {
    let state = getState();
    if (!state.dongleId) {
      return;
    }
    const need = routesNeed(state);
    if (!need) {
      // already has metadata, don't bother
      return;
    }
    const key = routesRequestKey(state);
    const pending = services.requests.routes;
    if (pending && pending.key === key) {
      // the same request is already in flight
      return pending.promise;
    }
    console.debug('We need to update the segment metadata...');
    const { dongleId, limit: fetchLimit } = state;
    const fetchRange = state.filter;
    const selectedRouteId = selectSelectedRouteId(state);
    const generation = services.navigation.generation;

    // if requested segment range not in loaded routes, fetch it explicitly
    const req = selectedRouteId
      ? api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${selectedRouteId}`)
      : api.routes.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, fetchLimit);
    // only the latest request issued for a view may answer for it, whichever
    // order responses arrive in (A1 → B → A2: A1 is superseded by A2)
    services.requests.routesSeq += 1;
    const viewKey = routesViewKey(state);
    const request = { key, seq: services.requests.routesSeq };
    services.requests.routesLatest.set(viewKey, request.seq);
    services.requests.routes = request;
    const release = () => {
      if (services.requests.routes === request) services.requests.routes = null;
    };

    request.promise = req.then((routesData) => {
      state = getState();
      if (services.requests.routesLatest.get(viewKey) !== request.seq) {
        release();
        return;
      }
      if (routesRequestKey(state) !== key) {
        // obsolete: the device, drive, filter, limit or session changed meanwhile
        release();
        dispatch(checkRoutesData());
        return;
      }
      if (routesData && routesData.length === 0 && !api.auth.isAuthenticated()) {
        release();
        // redirect to login, returning to the complete current location; only
        // for the navigation that asked
        if (services.navigation.generation === generation) {
          hardNavigate(`/?${new URLSearchParams({ r: urlOfRouterLocation(state.router.location) })}`);
        }
        return;
      }

      const routes = (routesData || []).map(normalizeRoute).sort((a, b) => b.create_time - a.create_time);

      if (need === 'detail') {
        dispatch(routes.length
          ? { type: Types.ACTION_ROUTE_DETAIL, dongleId, route: routes[0] }
          : { type: Types.ACTION_ROUTE_DETAIL_MISSING, dongleId, logId: selectedRouteId });
        return routes;
      }

      dispatch({
        type: Types.ACTION_ROUTES_METADATA,
        dongleId,
        start: fetchRange.start,
        end: fetchRange.end,
        routes,
      });
      if (selectedRouteId && !routes.some((route) => route.log_id === selectedRouteId)) {
        dispatch({ type: Types.ACTION_ROUTE_DETAIL_MISSING, dongleId, logId: selectedRouteId });
      }

      return routes
    }).catch((err) => {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
    }).finally(release);

    return request.promise;
  };
}

export function checkLastRoutesData() {
  return (dispatch, getState) => {
    const { limit, routes, filter } = getState();

    // if current routes are fewer than limit, that means the last fetch already fetched all the routes
    if (routes && routes.length < limit) {
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
