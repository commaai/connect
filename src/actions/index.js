import { push } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { webrtcConnectionManager } from '../utils/webrtc';
import { hardNavigate } from '../utils/navigation';
import { buildUrl, parseUrl } from '../url';

let routesRequest = null;
const LIMIT_INCREMENT = 5
const currentLocation = (state) => state.router?.location || window.location;
const locationUrl = (location) => `${location.pathname}${location.search || ''}${location.hash || ''}`;
const getRoutesRequestKey = ({ dongleId, filter, limit, selectedRouteId }) => (
  [dongleId, filter.start, filter.end, limit, selectedRouteId].join('|')
);

export function navigate(destination) {
  return (dispatch, getState) => {
    const location = currentLocation(getState());
    const nextUrl = buildUrl(destination, location);
    if (locationUrl(location) !== nextUrl) {
      dispatch(push(nextUrl));
    }
  };
}

export function checkRoutesData() {
  return (dispatch, getState) => {
    let state = getState();
    if (!state.dongleId) {
      return;
    }
    const requestedRouteId = state.selectedRouteId;
    if (requestedRouteId
      ? state.currentRouteFetched || state.routes?.some((route) => route.log_id === requestedRouteId)
      : hasRoutesData(state)) {
      // already has metadata, don't bother
      return;
    }
    const { dongleId, limit: fetchLimit, filter: fetchRange } = state;
    const requestKey = getRoutesRequestKey(state);
    if (routesRequest?.key === requestKey) {
      // there is already an pending request
      return routesRequest.promise;
    }
    console.debug('We need to update the segment metadata...');
    const request = { key: requestKey };
    routesRequest = request;

    request.promise = (requestedRouteId
      ? api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${requestedRouteId}`)
      : api.routes.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, fetchLimit)).then((routesData) => {
      if (routesRequest !== request) {
        return;
      }
      state = getState();
      if (getRoutesRequestKey(state) !== request.key) {
        routesRequest = null;
        dispatch(checkRoutesData());
        return;
      }
      if (!Array.isArray(routesData)) {
        throw new Error('Invalid routes response');
      }
      if (routesData.length === 0 && !api.auth.isAuthenticated()) {
        routesRequest = null;
        hardNavigate(`/?r=${encodeURIComponent(locationUrl(currentLocation(state)))}`);
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
        selectedOnly: Boolean(requestedRouteId),
        routes,
      });

      routesRequest = null;

      return routes;
    }).catch((err) => {
      if (routesRequest === request) {
        routesRequest = null;
      }
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
    });

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

function sameUrlState(state, destination) {
  if (state.dongleId !== destination.dongleId || state.selectedRouteId !== destination.routeId
    || state.primeNav !== (destination.page === 'prime')
    || state.streamNav !== (destination.page === 'stream')) {
    return false;
  }
  if (destination.routeId && destination.zoom) {
    return state.zoom?.start === destination.zoom.start && state.zoom?.end === destination.zoom.end;
  }
  if (!destination.routeId) {
    return !state.zoom;
  }
  return !state.zoom || (state.currentRoute?.log_id === destination.routeId
    && state.zoom.start === 0 && state.zoom.end === state.currentRoute.duration);
}

export function applyUrl(location, preferredDeviceId = null) {
  return (dispatch, getState) => {
    const previous = getState();
    const url = parseUrl(location);
    if (!url.dongleId && ['home', 'referrals'].includes(url.page)) {
      url.dongleId = preferredDeviceId || previous.dongleId;
    }
    if (sameUrlState(previous, url)) {
      return;
    }

    const deviceChanged = previous.dongleId !== url.dongleId;
    const selectionChanged = previous.selectedRouteId !== url.routeId
      || previous.zoom?.start !== url.zoom?.start || previous.zoom?.end !== url.zoom?.end;
    const primeChanged = previous.primeNav !== (url.page === 'prime');
    const streamChanged = previous.streamNav !== (url.page === 'stream');

    if (deviceChanged && previous.dongleId) {
      webrtcConnectionManager.disconnect();
    }
    dispatch({ type: Types.ACTION_APPLY_URL, url });

    const state = getState();
    if (state.dongleId && url.page !== 'legacy' && (deviceChanged || selectionChanged)) {
      dispatch(checkRoutesData());
    }

    if (deviceChanged && state.dongleId) {
      const device = getDeviceFromState(state, state.dongleId);
      if (device && (!device.shared || state.profile?.superuser)) {
        if (url.page !== 'prime') dispatch(primeFetchSubscription(state.dongleId, device));
        dispatch(fetchDeviceOnline(state.dongleId));
      } else if (!device) {
        dispatch(fetchSharedDevice(state.dongleId));
      }
    }

    if (state.dongleId && url.page === 'prime' && (deviceChanged || primeChanged)) {
      dispatch(primeFetchSubscription(state.dongleId, state.device, state.profile));
    }

    if (selectionChanged && state.selectedRouteId && state.zoom) {
      const { start, end } = state.zoom;
      if (!state.loop || !state.loop.startTime || !state.loop.duration || state.loop.startTime < start
        || state.loop.startTime + state.loop.duration > end || state.loop.duration < end - start) {
        dispatch(resetPlayback());
        dispatch(selectLoop(start, end));
      }
    }

    if ((streamChanged || deviceChanged) && url.page === 'stream' && state.dongleId) {
      webrtcConnectionManager.reconnect(state.dongleId);
    }
  };
}

export function selectDevice(dongleId) {
  return (dispatch, getState) => {
    const currentUrl = parseUrl(currentLocation(getState()));
    dispatch(navigate({
      page: 'dashboard',
      dongleId,
      modal: currentUrl.modal === 'pair' ? 'pair' : null,
    }));
  };
}

export function pushTimelineRange(routeId, start, end) {
  return (dispatch, getState) => {
    const state = getState();
    const route = state.currentRoute?.log_id === routeId && state.currentRoute.dongle_id === state.dongleId
      ? state.currentRoute
      : state.routes?.find((candidate) => candidate.log_id === routeId && candidate.dongle_id === state.dongleId);
    const wholeDrive = start == null || end == null || (start === 0 && end === route?.duration);
    dispatch(navigate({
      page: routeId ? 'drive' : 'dashboard',
      dongleId: state.dongleId,
      routeId,
      zoom: wholeDrive ? null : { start, end },
    }));
  };
}

export function primeNav(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) dispatch(navigate({ page: nav ? 'prime' : 'dashboard', dongleId }));
  };
}

export function streamNav(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) dispatch(navigate({ page: nav ? 'stream' : 'dashboard', dongleId }));
  };
}

export function navigateModal(modal, targetDeviceId = null) {
  return (dispatch, getState) => {
    const location = currentLocation(getState());
    const url = parseUrl(location);
    dispatch(navigate({ ...url, modal, targetDeviceId }));
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
