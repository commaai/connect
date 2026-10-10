import { push } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';
import { buildLocation } from '../url';

import * as Types from './types';
import { resetPlayback, selectLoop } from '../timeline/playback';
import {hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { webrtcConnectionManager } from '../utils/webrtc';
import { hardNavigate } from '../utils/navigation';

let routesRequest = null;
let routesRequestPromise = null;
const LIMIT_INCREMENT = 5
const currentURL = (state) => {
  const location = state.router?.location || window.location;
  return `${location.pathname}${location.search}`;
};

export function checkRoutesData() {
  return (dispatch, getState) => {
    let state = getState();
    if (!state.dongleId) {
      return;
    }
    if (state.selectedRouteId ? state.currentRoute?.log_id === state.selectedRouteId
      || state.routes?.some(route => route.log_id === state.selectedRouteId) : hasRoutesData(state)) {
      // already has metadata, don't bother
      return;
    }
    if (routesRequest && routesRequest.dongleId === state.dongleId && routesRequest.routeId === state.selectedRouteId) {
      // there is already an pending request
      return routesRequestPromise;
    }
    console.debug('We need to update the segment metadata...');
    const { dongleId, selectedRouteId, limit: fetchLimit } = state;
    const fetchRange = state.filter;

    // if requested segment range not in loaded routes, fetch it explicitly
    if (state.selectedRouteId) {
      routesRequest = {
        req: api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${state.selectedRouteId}`),
        dongleId,
        routeId: selectedRouteId,
      };
    } else {
      routesRequest = {
        req: api.routes.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, fetchLimit),
        dongleId,
        routeId: selectedRouteId,
      };
    }

    const request = routesRequest;
    routesRequestPromise = request.req.then((routesData) => {
      if (routesRequest !== request) return;
      state = getState();
      const currentRange = state.filter;
      if (currentRange.start !== fetchRange.start
        || currentRange.end !== fetchRange.end
        || state.limit !== fetchLimit
        || state.dongleId !== dongleId
        || state.selectedRouteId !== selectedRouteId) {
        routesRequest = null;
        dispatch(checkRoutesData());
        return;
      }
      if (routesData && routesData.length === 0
        && !api.auth.isAuthenticated()) {
        routesRequest = null;
        hardNavigate(`/?r=${encodeURIComponent(currentURL(state))}`); // redirect to login
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
        routeOnly: Boolean(selectedRouteId),
      });

      routesRequest = null;

      return routes
    }).catch((err) => {
      if (routesRequest !== request) return;
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
      routesRequest = null;
    });

    return routesRequestPromise
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

export function navigate(navigation, historyState) {
  return (dispatch, getState) => {
    const state = getState();
    const location = state.router.location;
    const current = state.navigation;
    const samePage = (navigation.dongleId === state.dongleId || !current.dongleId)
      && (navigation.page || 'dashboard') === current.page
      && (navigation.selectedRouteId || null) === current.selectedRouteId
      && Boolean(navigation.primeNav) === current.primeNav
      && Boolean(navigation.streamNav) === current.streamNav;
    const target = buildLocation(navigation, samePage ? location.search : '');
    if (historyState !== undefined) target.state = historyState;
    else if (navigation.selectedRouteId === state.navigation.selectedRouteId && location.state) target.state = location.state;
    if (location.pathname !== target.pathname || location.search !== target.search) dispatch(push(target));
  };
}

export function openModal(modal, modalDeviceId = null, clipFilename = null) {
  return (dispatch, getState) => {
    const state = getState();
    const current = state.navigation;
    const parentModal = ['settings', 'files', 'clips'].includes(current.modal) ? current.modal : current.parentModal;
    dispatch(navigate({ ...current, dongleId: state.dongleId, modal, parentModal, modalDeviceId: modalDeviceId || current.modalDeviceId, clipFilename }));
  };
}

export function closeModal() {
  return (dispatch, getState) => {
    const navigation = getState().navigation;
    dispatch(navigate({ ...navigation, modal: navigation.parentModal, parentModal: null }));
  };
}

// Only the history middleware applies a drive selection to state.
export function applyTimelineRange(log_id, start, end, previousZoom = null) {
  return (dispatch, getState) => {
    const state = getState();
    const route = state.currentRoute?.log_id === log_id ? state.currentRoute : state.routes?.find(candidate => candidate.log_id === log_id);
    start = start ?? (route ? 0 : null);
    end = end ?? route?.duration ?? null;
    if (state.zoom?.start === start && state.zoom?.end === end && state.selectedRouteId === log_id) return;
    dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id, start, end, previousZoom });
    dispatch(resetPlayback());
    dispatch(selectLoop(start, end));
  };
}

function timelineNavigation(state, log_id, start, end) {
  const route = state.currentRoute?.log_id === log_id ? state.currentRoute : state.routes?.find(candidate => candidate.log_id === log_id);
  const wholeDrive = start == null || end == null || (start === 0 && end === route?.duration);
  return {
    dongleId: state.dongleId,
    selectedRouteId: log_id,
    zoom: wholeDrive ? null : { start, end },
  };
}

export function pushTimelineRange(log_id, start, end) {
  return (dispatch, getState) => {
    const state = getState();
    dispatch(navigate(timelineNavigation(state, log_id, start, end), {
      previousZoom: state.selectedRouteId === log_id ? state.zoom : null,
    }));
  };
}

export function popTimelineRange(log_id) {
  return (dispatch, getState) => {
    const state = getState();
    const previous = state.zoom?.previous;
    if (previous) dispatch(navigate(timelineNavigation(state, log_id, previous.start, previous.end), {
      previousZoom: previous.previous,
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

// Device data is loaded on startup and when history selects a different device.
export function loadDevice(dongleId) {
  return (dispatch, getState) => {
    const state = getState();
    const device = state.devices?.find(candidate => candidate.dongle_id === dongleId)
      || (state.device?.dongle_id === dongleId ? state.device : null);
    if (state.dongleId && state.dongleId !== dongleId) webrtcConnectionManager.disconnect();
    dispatch({ type: Types.ACTION_SELECT_DEVICE, dongleId });
    if ((device && !device.shared) || state.profile?.superuser) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    }
  };
}

export function selectDevice(dongleId) {
  return navigate({ dongleId });
}

export function primeNav(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) dispatch(navigate({ dongleId, primeNav: nav }));
  };
}

export function streamNav(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) dispatch(navigate({ dongleId, streamNav: nav }));
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
