import { push } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import document from 'global/document';
import { billing as Billing, devices as DevicesApi, drives as Drives } from '@commaai/comma-api';

import * as Types from './types';
import { getDongleID } from '../url';
import { resetPlayback, selectLoop, currentOffset } from '../timeline/playback'
import Segments from '../timeline/segments';
import * as Demo from '../demo';

const demoSegments = require('../demo/segments.json');

let segmentsRequest = null;

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

    dispatch(checkSegmentMetadata());

    const curPath = document.location.pathname;
    const desiredPath = urlForState(dongleId, state.zoom.start, state.zoom.end, null);
    if (curPath !== desiredPath) {
      dispatch(push(desiredPath));
    }
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
          console.log(err);
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
      dispatch({
        type: Types.ACTION_UPDATE_DEVICE_ONLINE,
        dongleId: dongleId,
        last_athena_ping: resp.last_athena_ping,
        fetched_at: parseInt(Date.now() / 1000),
      });
    }).catch(console.log);
  };
}

export function checkSegmentMetadata() {
  return (dispatch, getState) => {
    let state = getState();
    if (!state.dongleId) {
      return;
    }
    if (Segments.hasSegmentMetadata(state)) {
      // already has metadata, don't bother
      return;
    }
    if (segmentsRequest) {
      return;
    }
    console.log('We need to update the segment metadata...');
    const { dongleId, start, end } = state;

    if (Demo.isDemo()) {
      segmentsRequest = Promise.resolve(demoSegments);
    } else {
      segmentsRequest = Drives.getSegmentMetadata(start, end, dongleId);
    }
    dispatch(Segments.fetchSegmentMetadata(start, end));

    segmentsRequest.then((segmentData) => {
      state = getState();
      if (state.start !== start || state.end !== end || state.dongleId !== dongleId) {
        checkSegmentMetadata(state);
        return;
      }

      segmentData = Segments.parseSegmentMetadata(state, segmentData);
      dispatch(Segments.insertSegmentMetadata(segmentData));

      segmentsRequest = null;
    }).catch((err) => {
      console.error('Failure fetching segment metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_segments' });
      segmentsRequest = null;
    });
  }
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
