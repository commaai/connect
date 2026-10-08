import { go, push, replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import {hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { webrtcConnectionManager } from '../utils/webrtc';
import { hardNavigate } from '../utils/navigation';
import { dialogUrl, formatSeconds, parseUrl } from '../url';

// each store's newest routes request; a request that is no longer the newest changes nothing
const routesRequests = new WeakMap();
const LIMIT_INCREMENT = 5
const currentPathname = (state) => state.router?.location?.pathname || window.location.pathname;
// what a drive list request depends on
const routesKey = (state) => [state.dongleId, state.filter.start, state.filter.end, state.limit].join();

export function checkRoutesData() {
  return (dispatch, getState) => {
    let state = getState();
    if (!state.dongleId) {
      return;
    }
    if (hasRoutesData(state) && (!state.selectedRouteId || state.routes.some((r) => r.log_id === state.selectedRouteId))) {
      // already has metadata, don't bother
      return;
    }
    const pending = routesRequests.get(getState);
    if (pending && pending.dongleId === state.dongleId) {
      // there is already an pending request
      return pending.promise;
    }
    console.debug('We need to update the segment metadata...');
    const { dongleId, limit: fetchLimit, selectedRouteId } = state;
    const fetchRange = state.filter;
    const key = routesKey(state);
    if (!selectedRouteId && !api.auth.isAuthenticated()) {
      // signed out, only a public drive can be loaded
      return;
    }

    // if requested segment range not in loaded routes, fetch it explicitly
    const req = selectedRouteId
      ? api.routes.getRoutesSegments(dongleId, undefined, undefined, undefined, `${dongleId}|${selectedRouteId}`)
      : api.routes.getRoutesSegments(dongleId, fetchRange.start, fetchRange.end, fetchLimit);
    const request = { dongleId };
    routesRequests.set(getState, request);
    const finish = () => {
      if (routesRequests.get(getState) === request) {
        routesRequests.delete(getState);
        return true;
      }
      return false;
    };

    request.promise = req.then((routesData) => {
      if (!finish()) {
        return;
      }
      state = getState();
      if (routesKey(state) !== key || (selectedRouteId && state.selectedRouteId !== selectedRouteId)) {
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

      // a single drive is not the drive list for the filter range, so it is not recorded as one
      dispatch({
        type: Types.ACTION_ROUTES_METADATA,
        dongleId,
        start: selectedRouteId ? null : fetchRange.start,
        end: selectedRouteId ? null : fetchRange.end,
        routes,
      });

      if (getState().selectedRouteId !== selectedRouteId) {
        dispatch(checkRoutesData());
      }

      return routes
    }).catch((err) => {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
      finish();
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

function navigate(path) {
  return (dispatch, getState) => {
    const { pathname, search } = getState().router.location;
    if (pathname + search !== path) {
      dispatch(push(path));
    }
  };
}

export function pushTimelineRange(log_id, start, end) {
  return (dispatch, getState) => {
    const { dongleId, routes } = getState();
    const route = routes?.find((candidate) => candidate.log_id === log_id);
    const wholeDrive = start == null || end == null || (Math.round(start) === 0 && Math.round(end) === route?.duration);
    const range = wholeDrive ? '' : `/${formatSeconds(start)}/${formatSeconds(end)}`;
    dispatch(navigate(`/${dongleId}/${log_id}${range}`));
  };
}

export function popTimelineRange(log_id) {
  return (dispatch, getState) => {
    const { previous } = getState().zoom;
    dispatch(pushTimelineRange(log_id, previous.start, previous.end));
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

// Changes the selected device in state only; navigation happens through selectDevice.
export function setDevice(dongleId) {
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

    if ((device && !device.shared) || state.profile?.superuser) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    }
  };
}

export function selectDevice(dongleId) {
  return navigate(dongleId ? `/${dongleId}` : '/');
}

export function primeNav(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) {
      dispatch(navigate(nav ? `/${dongleId}/prime` : `/${dongleId}`));
    }
  };
}

// A dialog opened here is a history entry, and location.state.dialog counts the
// entries opened here above the page. Closing goes Back over them, so Back after
// closing does not reopen the dialog; one opened from a link closes in place.
export function openDialog(dialog, clip) {
  return (dispatch, getState) => {
    const { location } = getState().router;
    const shown = parseUrl(location.pathname, location.search);
    const path = dialogUrl(location, dialog, clip);
    if (path === dialogUrl(location, shown.dialog, shown.clip)) {
      return;
    }
    // another clip takes the place of the one playing
    dispatch(shown.clip && clip ? replace(path, location.state) : push(path, { dialog: (location.state?.dialog ?? 0) + 1 }));
  };
}

// Closes the shown dialog, back to `parent` (the clips menu under a clip) or the page.
export function closeDialog(parent = null) {
  return (dispatch, getState) => {
    const { location } = getState().router;
    const shown = parseUrl(location.pathname, location.search);
    const levels = Boolean(shown.dialog) + Boolean(shown.clip) - Boolean(parent);
    const opened = location.state?.dialog ?? 0;
    dispatch(levels > 0 && opened >= levels ? go(-levels) : replace(dialogUrl(location, parent)));
  };
}

// Settings open over the shown page of the selected device, or over another device's dashboard.
export function settingsNav(dongleId) {
  return (dispatch, getState) => {
    dispatch(dongleId === getState().dongleId ? openDialog('settings') : push(`/${dongleId}?dialog=settings`, { dialog: 1 }));
  };
}

export function streamNav(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) {
      dispatch(navigate(nav ? `/${dongleId}/stream` : `/${dongleId}`));
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
