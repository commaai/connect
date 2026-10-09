import { goBack, push, replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { athena as Athena, billing as Billing } from '../api';
import { api } from '../api/backend';

import * as Types from './types';
import { resetPlayback, selectLoop } from '../timeline/playback';
import {hasRoutesData } from '../timeline/segments';
import { getDeviceFromState, deviceVersionAtLeast, deviceIsOnline } from '../utils';
import { webrtcConnectionManager } from '../utils/webrtc';
import { hardNavigate } from '../utils/navigation';
import { deviceUrl, driveUrl, parseFilter, filterSearch, dialogUrl, parseUrl, getDialog } from '../url';

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
    if (state.selectedRouteId
      ? Object.hasOwn(state.routeCache || {}, state.selectedRouteId) || state.routes?.some((route) => route.log_id === state.selectedRouteId)
      : hasRoutesData(state)) {
      // already has metadata, don't bother
      routesRequests.delete(getState);
      return;
    }
    const { dongleId, limit: fetchLimit, selectedRouteId } = state;
    const fetchRange = state.filter;
    const key = JSON.stringify([dongleId, selectedRouteId, fetchRange.start, fetchRange.end, fetchLimit]);
    const pending = routesRequests.get(getState);
    if (pending?.key === key) return pending.promise;

    const request = { key };
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
        || state.selectedRouteId !== selectedRouteId
        || state.dongleId !== dongleId) {
        return;
      }
      if (routesData && routesData.length === 0
        && !api.auth.isAuthenticated()) {
        const location = state.router?.location || window.location;
        hardNavigate(`/?r=${encodeURIComponent(`${location.pathname}${location.search || ''}${location.hash || ''}`)}`);
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
        logId: selectedRouteId,
        // A single-drive response does not cover the dashboard's date filter.
        start: selectedRouteId ? null : fetchRange.start,
        end: selectedRouteId ? null : fetchRange.end,
        routes,
      });

      return routes
    }).catch((err) => {
      console.error('Failure fetching routes metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_routes' });
    }).finally(() => {
      if (routesRequests.get(getState) === request) routesRequests.delete(getState);
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

export function urlForState(dongleId, log_id, start, end, prime) {
  const zoom = start != null && end != null ? { start: start * 1000, end: end * 1000 } : null;
  return log_id ? driveUrl(dongleId, log_id, zoom) : deviceUrl(dongleId, prime ? 'prime' : '');
}

export function navigate(pathname) {
  return (dispatch, getState) => {
    const location = getState().router?.location;
    const search = filterSearch(parseFilter(location?.search));
    const modal = ['settings', 'uploads', 'filter', 'pair'].includes(parseUrl(pathname).page);
    dispatch(push(`${pathname}${search}`, modal ? { modalParent: `${location.pathname}${location.search}${location.hash || ''}` } : undefined));
  };
}

export function closeNavigation(pathname) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    dispatch(location.state?.modalParent ? goBack() : replace(`${pathname}${filterSearch(parseFilter(location.search))}`));
  };
}

export function navigateDialog(dialog, clip = null) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    const url = dialogUrl(location, dialog, clip);
    const current = `${location.pathname}${location.search}${location.hash || ''}`;
    if (url === current) return;
    if (location.state?.dialogParent === url) {
      dispatch(goBack());
    } else if (!dialog) {
      dispatch(replace(url));
    } else if (getDialog(location) && getDialog(location) !== 'clips') {
      dispatch(replace(url, location.state));
    } else {
      dispatch(push(url, { ...location.state, dialogParent: current }));
    }
  };
}

export function pushTimelineRange(log_id, start, end) {
  return (dispatch, getState) => {
    const state = getState();
    const route = state.routeCache?.[log_id] || state.routes?.find((candidate) => candidate.log_id === log_id);
    const wholeDrive = start == null || end == null || (start === 0 && end === route?.duration);
    const urlStart = wholeDrive ? null : start / 1000;
    const urlEnd = wholeDrive ? null : end / 1000;
    const desiredPath = urlForState(state.dongleId, log_id, urlStart, urlEnd, false);
    if (currentPathname(state) !== desiredPath) {
      dispatch(navigate(desiredPath));
    }
  };
}

// Only the URL reconciler applies a selection. UI actions navigate instead.
export function selectRoute(log_id, start, end) {
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

    dispatch(resetPlayback());
    const zoom = getState().zoom;
    dispatch(selectLoop(zoom?.start ?? null, zoom?.end ?? null));
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

    dispatch(selectRoute(null, null, null));
    if ((device && !device.shared) || state.profile?.superuser) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    }

  };
}

export function selectDevice(dongleId) {
  return (dispatch, getState) => {
    const path = deviceUrl(dongleId);
    if (currentPathname(getState()) !== path) {
      dispatch(push(path));
    }
  };
}

export function primeNav(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) {
      dispatch(navigate(deviceUrl(dongleId, nav ? 'prime' : '')));
    }
  };
}

export function streamNav(nav) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    if (dongleId) {
      dispatch(navigate(deviceUrl(dongleId, nav ? 'stream' : '')));
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
    dispatch(push(`${deviceUrl(getState().dongleId)}${filterSearch({ start, end })}`));
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
