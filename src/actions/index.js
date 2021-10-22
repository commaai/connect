import { push } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import document from 'global/document';
import * as Types from './types';
import Timelineworker from '../timeline';
import { getDongleID } from '../url';
import { billing as Billing, devices as DevicesApi } from '@commaai/comma-api';
import { resetPlayback, selectLoop } from '../timeline/playback'

export function selectRange(start, end, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();
    if (!state.dongleId) {
      dispatch({
        type: Types.TIMELINE_SELECTION_CHANGED,
        start,
        end
      });
      return;
    }
    if (state.primeNav) {
      dispatch(primeNav(false, false));
    }
    const curPath = document.location.pathname;
    const dongleId = getDongleID(curPath) || state.dongleId;
    const desiredPath = urlForState(dongleId, start, end, false);

    if (state.zoom.start !== start || state.zoom.end !== end) {
      dispatch({
        type: Types.TIMELINE_SELECTION_CHANGED,
        start,
        end
      });
    }

    if (!state.loop.startTime
      || !state.loop.duration
      || state.loop.startTime < start
      || state.loop.startTime + state.loop.duration > end
      || state.loop.duration < end - start) {
      dispatch(resetPlayback());
      dispatch(selectLoop(start, end - start));
    }

    if (allowPathChange && curPath !== desiredPath) {
      dispatch(push(desiredPath));
    }
  };
}

export function selectDevice(dongleId) {
  return (dispatch, getState) => {
    const state = getState();
    let device;
    if (state.devices && state.devices.length > 1) {
      device = state.devices.find((d) => d.dongle_id === dongleId);
    }
    if (!device && state.device && state.device.dongle_id === dongleId) {
      device = state.device;
    }

    dispatch({
      type: Types.ACTION_SELECT_DEVICE,
      dongleId,
    });

    dispatch(selectRange(null, null, false))
    if (device && !device.shared) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    }

    const curPath = document.location.pathname;
    const desiredPath = urlForState(dongleId, state.zoom.start, state.zoom.end, null);
    if (curPath !== desiredPath) {
      dispatch(push(desiredPath));
    }
  };
}

export function primeFetchSubscription(dongleId, device) {
  return (dispatch, getState) => {
    const state = getState();

    if ((device && device.is_owner) || state.profile.superuser) {
      if (device.prime) {
        Billing.getSubscription(dongleId).then((subscription) => {
          dispatch(primeGetSubscription(dongleId, subscription));
        }).catch((err) => {
          console.log(err);
          Sentry.captureException(err, { fingerprint: 'actions_fetch_subscription' });
        });
      } else {
        Billing.getSubscribeInfo(dongleId).then((subscribeInfo) => {
          dispatch(primeGetSubscribeInfo(dongleId, subscribeInfo));
        }).catch((err) => {
          console.log(err);
          Sentry.captureException(err, { fingerprint: 'actions_fetch_subscribe_info' });
        });
      }
    }
  };
}

export function primeNav(nav = true, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();

    if (state.primeNav != nav) {
      dispatch({
        type: Types.ACTION_PRIME_NAV,
        primeNav: nav,
      });
    }

    const curPath = document.location.pathname;
    const desiredPath = urlForState(state.dongleId, null, null, nav);
    if (allowPathChange && curPath !== desiredPath) {
      dispatch(push(desiredPath));
    }
  };
}

export function fetchDeviceOnline(dongleId) {
  return (dispatch, getState) => {
    DevicesApi.fetchDevice(dongleId).then((resp) => {
      if (resp.dongle_id === dongleId) {
        dispatch({
          type: Types.ACTION_UPDATE_DEVICE_ONLINE,
          dongleId: dongleId,
          last_athena_ping: resp.last_athena_ping,
          fetched_at: parseInt(Date.now() / 1000),
        });
      }
    }).catch(console.log);
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

export function selectTimeRange(start, end) {
  return {
    type: Types.ACTION_SELECT_TIME_RANGE,
    start,
    end
  };
}

export function primeGetSubscription(dongleId, subscription) {
  return {
    type: Types.ACTION_PRIME_SUBSCRIPTION,
    dongleId,
    subscription,
  };
}

export function primeGetSubscribeInfo(dongleId, subscribeInfo) {
  return {
    type: Types.ACTION_PRIME_SUBSCRIBE_INFO,
    dongleId,
    subscribeInfo,
  };
}

function urlForState(dongleId, start, end, prime_nav) {
  const path = [dongleId];

  if (start && end) {
    path.push(start);
    path.push(end);
  } else if (prime_nav) {
    path.push('prime');
  }

  return `/${path.join('/')}`;
}
