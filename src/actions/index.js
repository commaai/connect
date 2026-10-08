import { push, replace } from 'connected-react-router';
import { buildUrl, withModal } from '../url';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { resetPlayback, selectLoop } from '../timeline/playback';
import {hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { webrtcConnectionManager } from '../utils/webrtc';
import { hardNavigate } from '../utils/navigation';

// Each store owns its in-flight metadata lookup. A request belongs to a device,
// route, filter and limit, rather than to whichever URL happens to finish last.
const routesRequests = new WeakMap();
const LIMIT_INCREMENT = 5
const currentPathname = (state) => state.router?.location?.pathname || window.location.pathname;

export function checkRoutesData() {
  return (dispatch, getState) => {
    let state = getState();
    if (!state.dongleId) {
      return;
    }
    if (state.limit === 0) {
      dispatch({ type: Types.ACTION_UPDATE_ROUTE_LIMIT, limit: LIMIT_INCREMENT });
      state = getState();
    }
    const selectedRouteId = state.selectedRouteId;
    const loaded = selectedRouteId
      ? state.routes?.some((route) => route.log_id === selectedRouteId)
      : hasRoutesData(state);
    if (loaded) {
      // already has metadata, don't bother
      return;
    }
    const requestKey = JSON.stringify([state.dongleId, selectedRouteId, state.filter.start, state.filter.end, state.limit]);
    const pending = routesRequests.get(getState);
    if (pending?.key === requestKey) {
      // there is already an pending request
      return pending.promise;
    }
    console.debug('We need to update the segment metadata...');
    const { dongleId, limit: fetchLimit } = state;
    const fetchRange = state.filter;

    // if requested segment range not in loaded routes, fetch it explicitly
    const request = { key: requestKey };
    routesRequests.set(getState, request);
    const response = selectedRouteId
      ? api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${selectedRouteId}`)
      : api.routes.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, fetchLimit);

    request.promise = response.then((routesData) => {
      if (routesRequests.get(getState) !== request) return;
      state = getState();
      const currentRange = state.filter;
      if (currentRange.start !== fetchRange.start
        || currentRange.end !== fetchRange.end
        || state.limit !== fetchLimit
        || state.dongleId !== dongleId
        || state.selectedRouteId !== selectedRouteId) {
        routesRequests.delete(getState);
        dispatch(checkRoutesData());
        return;
      }
      if (routesData && routesData.length === 0
        && !api.auth.isAuthenticated()) {
        hardNavigate(`/?r=${encodeURI(currentPathname(state))}`); // redirect to login
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
        // A single drive does not establish coverage of the dashboard filter.
        start: selectedRouteId ? null : fetchRange.start,
        end: selectedRouteId ? null : fetchRange.end,
        routes,
      });

      return routes
    }).catch((err) => {
      if (routesRequests.get(getState) !== request) return;
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
    }).finally(() => {
      if (routesRequests.get(getState) === request) routesRequests.delete(getState);
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

// Navigation actions only write history. The history middleware applies every
// location (PUSH, REPLACE, and POP) to state through the same path.
function goTo(path) {
  return (dispatch, getState) => {
    const location = getState().router?.location;
    if (`${location?.pathname ?? currentPathname(getState())}${location?.search ?? ''}` !== path) {
      dispatch(push(path));
    }
  };
}

function rangeUrl(state, log_id, start, end, wholeDrive = false) {
  const route = state.routes?.find((candidate) => candidate.log_id === log_id);
  const isWhole = wholeDrive || start == null || end == null || (start === 0 && end === route?.duration);
  const range = isWhole ? null : { start: Math.floor(start / 1000), end: Math.floor(end / 1000) };
  return buildUrl({ page: 'drive', dongleId: state.dongleId, logId: log_id, range });
}

function updateTimeline(state, dispatch, start, end, routeChanged = false) {
  if (routeChanged || !state.loop || state.loop.startTime == null || !state.loop.duration || state.loop.startTime < start
    || state.loop.startTime + state.loop.duration > end || state.loop.duration < end - start) {
    dispatch(resetPlayback());
    dispatch(selectLoop(start, end));
  }
}

// Modals live in the URL, over whatever page is open.
export function openModal(modal, modalDongleId, { replaceHistory = false, clipFilename } = {}) {
  return (dispatch, getState) => {
    const navigate = replaceHistory ? replace : push;
    dispatch(navigate(withModal(getState().router.location, modal, modalDongleId, clipFilename)));
  };
}

export function closeModal() {
  return (dispatch, getState) => {
    dispatch(replace(withModal(getState().router.location, null)));
  };
}

export function popTimelineRange() {
  return (dispatch, getState) => {
    const state = getState();
    if (state.zoom.previous) {
      dispatch({
        type: Types.TIMELINE_POP_SELECTION,
      });

      const { start, end } = state.zoom.previous;
      updateTimeline(state, dispatch, start, end);
    }
  };
}

export function goBackRange(log_id) {
  return (dispatch, getState) => {
    const state = getState();
    if (state.zoom.previous) {
      dispatch(goTo(rangeUrl(state, log_id, state.zoom.previous.start, state.zoom.previous.end)));
    }
  };
}

// wholeDrive: start..end spans the entire drive, even when its duration is not loaded to compare against
export function goToRange(log_id, start, end, { wholeDrive = false } = {}) {
  return (dispatch, getState) => {
    const state = getState();
    dispatch(goTo(rangeUrl(state, log_id, start, end, wholeDrive)));
  };
}

export function pushTimelineRange(log_id, start, end) {
  return (dispatch, getState) => {
    const state = getState();

    if (state.zoom?.start !== start || state.zoom?.end !== end || state.selectedRouteId !== log_id) {
      dispatch({
        type: Types.TIMELINE_PUSH_SELECTION,
        log_id,
        start,
        end,
      });
    }

    // A whole-drive URL has no explicit bounds; cached metadata resolves them
    // in the reducer just as metadata arriving after a direct entry would.
    const zoom = getState().zoom;
    updateTimeline(state, dispatch, zoom?.start ?? start, zoom?.end ?? end, state.selectedRouteId !== log_id);
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

export function selectDevice(dongleId, fetchRoutes = true) {
  return (dispatch, getState) => {
    const state = getState();
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

    dispatch(pushTimelineRange(null, null, null));
    if ((device && !device.shared) || state.profile?.superuser) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    }

    if (fetchRoutes) {
      dispatch(checkLastRoutesData());
    }
  };
}

export function goToDevice(dongleId) {
  return (dispatch) => {
    dispatch(goTo(buildUrl({ dongleId })));
  };
}

export function primeNav(nav) {
  return (dispatch, getState) => {
    const state = getState();
    if (!state.dongleId) {
      return;
    }

    if (state.primeNav !== nav) {
      dispatch({
        type: Types.ACTION_PRIME_NAV,
        primeNav: nav,
      });
    }
  };
}

export function goToPrime(nav, requestedDongleId) {
  return (dispatch, getState) => {
    const dongleId = requestedDongleId ?? getState().dongleId;
    if (dongleId) {
      dispatch(goTo(buildUrl({ page: nav ? 'prime' : 'device', dongleId })));
    }
  };
}

export function streamNav(nav) {
  return (dispatch, getState) => {
    const state = getState();
    if (!state.dongleId) {
      return;
    }

    if (state.streamNav !== nav) {
      dispatch({
        type: Types.ACTION_STREAM_NAV,
        streamNav: nav,
      });
    }
  };
}

export function goToStream(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) {
      dispatch(goTo(buildUrl({ page: nav ? 'stream' : 'device', dongleId })));
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
