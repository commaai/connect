import { goBack, push, replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { hardNavigate } from '../utils/navigation';
import { buildLocation, parentDestination } from '../url';

const routesRequests = new Map();
const routeCacheKey = (dongleId, logId) => `${dongleId}|${logId}`;
const LIMIT_INCREMENT = 5;

function currentLocation(state) {
  return state.router?.location || window.location;
}

function locationUrl(location) {
  return `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
}

export function navigateTo(destination, { replaceEntry = false, state: historyState } = {}) {
  return (dispatch, getState) => {
    const location = currentLocation(getState());
    const url = buildLocation(destination, location);
    if (locationUrl(location) === url) return;
    dispatch(replaceEntry ? replace(url, historyState) : push(url, historyState));
  };
}

export function openDialog(dialog, details = {}) {
  return (dispatch, getState) => {
    const state = getState();
    const location = currentLocation(state);
    const destination = { ...state.navigation, ...details, dialog };
    return dispatch(navigateTo(destination, {
      state: { ...location.state, navigationParent: locationUrl(location) },
    }));
  };
}

export function closeDialog() {
  return (dispatch, getState) => {
    const state = getState();
    const location = currentLocation(state);
    const destination = parentDestination(state.navigation);
    const parentUrl = buildLocation(destination, location);
    if (location.state?.navigationParent === parentUrl) {
      dispatch(goBack());
    } else {
      dispatch(navigateTo(destination, { replaceEntry: true }));
    }
  };
}

export function checkRoutesData() {
  return async (dispatch, getState) => {
    const state = getState();
    const { dongleId, selectedRouteId, filter, limit } = state;
    if (!dongleId) return;

    const routeKey = selectedRouteId ? routeCacheKey(dongleId, selectedRouteId) : null;
    if (routeKey && Object.prototype.hasOwnProperty.call(state.routeDetails, routeKey)) {
      return state.routeDetails[routeKey];
    }
    if (routeKey && state.routes?.some((route) => route.log_id === selectedRouteId)) return;
    if (!routeKey && hasRoutesData(state)) return state.routes;

    const requestKey = routeKey || `${dongleId}|${filter.start}|${filter.end}|${limit}`;
    if (routesRequests.has(requestKey)) return routesRequests.get(requestKey);

    const currentUrl = () => {
      const location = getState().router?.location;
      return location ? `${location.pathname}${location.search}${location.hash}` : window.location.href;
    };
    const startedAtUrl = currentUrl();
    const promise = (async () => {
      try {
        const routesData = routeKey
          ? await api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${selectedRouteId}`)
          : await api.routes.getRoutesSegments(dongleId, filter.start, filter.end, limit);
        const current = getState();
        if (current.dongleId !== dongleId) return;
        if (routeKey && current.selectedRouteId !== selectedRouteId) return;
        if (!routeKey && (current.filter.start !== filter.start || current.filter.end !== filter.end || current.limit !== limit)) return;

        if (routesData?.length === 0 && !api.auth.isAuthenticated()) {
          hardNavigate(`/?r=${encodeURIComponent(currentUrl())}`);
          return;
        }

        const routes = routesData.map((route) => {
          let startTime = route.segment_start_times[0];
          let endTime = route.segment_end_times[route.segment_end_times.length - 1];
          if ((Math.abs(route.start_time_utc_millis - startTime) > 24 * 60 * 60 * 1000)
              && (Math.abs(route.end_time_utc_millis - endTime) < 10 * 1000)) {
            startTime = route.start_time_utc_millis;
            endTime = route.end_time_utc_millis;
            route.segment_start_times = route.segment_numbers.map((number) => startTime + (number * 60 * 1000));
            route.segment_end_times = route.segment_numbers.map((number) => Math.min(startTime + ((number + 1) * 60 * 1000), endTime));
          }
          if (route.distance == null && route.length != null) route.distance = route.length;
          return {
            ...route,
            url: route.url.replace('chffrprivate.blob.core.windows.net', 'chffrprivate.azureedge.net'),
            log_id: route.fullname.split('|')[1],
            duration: endTime - startTime,
            start_time_utc_millis: startTime,
            end_time_utc_millis: endTime,
            segment_durations: route.segment_start_times.map((start, index) => route.segment_end_times[index] - start),
          };
        }).sort((a, b) => b.create_time - a.create_time);

        if (routeKey) {
          const route = routes[0];
          if (route) {
            dispatch({ type: Types.ACTION_ROUTE_DETAIL, dongleId, route });
          } else {
            dispatch({ type: Types.ACTION_ROUTE_DETAIL, dongleId, logId: selectedRouteId, route: null });
          }
          return route;
        }

        dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId, start: filter.start, end: filter.end, limit, routes });
        return routes;
      } catch (err) {
        console.error('Failure fetching routes metadata', err);
        Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
        return undefined;
      } finally {
        routesRequests.delete(requestKey);
        const current = getState();
        if (currentUrl() !== startedAtUrl && current.dongleId === dongleId) {
          dispatch(checkRoutesData());
        }
      }
    })();
    routesRequests.set(requestKey, promise);
    return promise;
  };
}

export function checkLastRoutesData() {
  return (dispatch, getState) => {
    const state = getState();
    const { limit, routes } = state;

    // if current routes are fewer than limit, that means the last fetch already fetched all the routes
    if (routes && routes.length < limit && state.routesMeta?.limit >= limit) {
      return;
    }

    const nextLimit = limit + LIMIT_INCREMENT;
    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_LIMIT,
      limit: nextLimit,
    });

    dispatch(checkRoutesData());
  };
}

export function urlForState(dongleId, log_id, start, end, prime) {
  const destination = {
    page: prime ? 'prime' : (log_id ? 'drive' : 'dashboard'),
    dongleId,
    logId: log_id,
    range: log_id && start != null && end != null ? { start: start * 1000, end: end * 1000 } : null,
  };
  return buildLocation(destination);
}

export function popTimelineRange(log_id) {
  return (dispatch, getState) => {
    const state = getState();
    if (!state.dongleId || !log_id) return;
    return dispatch(navigateTo({ ...state.navigation, page: 'drive', logId: log_id, range: null, dialog: null }));
  };
}

export function pushTimelineRange(log_id, start, end) {
  return (dispatch, getState) => {
    const state = getState();
    const route = state.routes?.find((candidate) => candidate.log_id === log_id)
      || state.routeDetails?.[routeCacheKey(state.dongleId, log_id)];
    const wholeDrive = start == null || end == null || (start === 0 && end === route?.duration);
    const destination = {
      ...state.navigation,
      page: log_id ? 'drive' : 'dashboard',
      dongleId: state.dongleId,
      logId: log_id,
      range: log_id && !wholeDrive ? { start, end } : null,
      dialog: null,
      dialogDeviceId: null,
      clip: null,
    };
    return dispatch(navigateTo(destination));
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

export function selectDevice(dongleId) {
  return (dispatch, getState) => {
    const state = getState();
    if (!dongleId) return;
    return dispatch(navigateTo({ ...state.navigation, page: 'dashboard', dongleId, logId: null, range: null, dialog: null }));
  };
}

export function primeNav(nav) {
  return (dispatch, getState) => {
    const { dongleId, navigation } = getState();
    if (!dongleId) return;
    return dispatch(navigateTo({ ...navigation, page: nav ? 'prime' : 'dashboard', dongleId, logId: null, range: null, dialog: null }));
  };
}

export function streamNav(nav) {
  return (dispatch, getState) => {
    const { dongleId, navigation } = getState();
    if (!dongleId) return;
    return dispatch(navigateTo({ ...navigation, page: nav ? 'stream' : 'dashboard', dongleId, logId: null, range: null, dialog: null }));
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
    const state = getState();
    if (!state.dongleId || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    return dispatch(navigateTo({
      ...state.navigation,
      page: 'dashboard',
      dongleId: state.dongleId,
      logId: null,
      range: null,
      filter: { start, end },
      dialog: null,
    }, { replaceEntry: state.navigation.dialog === 'filter' }));
  };
}

export function resolveLegacyRange(dongleId, start, end) {
  return async (dispatch, getState) => {
    const state = getState();
    const initialLocation = currentLocation(state);
    const initialUrl = locationUrl(initialLocation);
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, start, end);
      const current = getState();
      if (locationUrl(currentLocation(current)) !== initialUrl || !routes?.length) return;
      const logId = routes[0].fullname.split('|')[1];
      dispatch(navigateTo({ ...current.navigation, page: 'drive', dongleId, logId, range: null }, { replaceEntry: true }));
    } catch (err) {
      console.error('Error fetching routes data for legacy URL conversion', err);
      Sentry.captureException(err, { fingerprint: 'history_legacy_url_conversion' });
    }
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
