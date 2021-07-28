import { push } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import document from 'global/document';
import * as Types from './types';
import Timelineworker from '../timeline';
import { getDongleID } from '../url';
import { billing as Billing, devices as DevicesApi } from '@commaai/comma-api';

export function updateState(data) {
  return {
    type: Types.WORKER_STATE_UPDATE,
    data
  };
}

export function selectRange(start, end) {
  return (dispatch, getState) => {
    const state = getState();
    if (!state.workerState.dongleId) {
      dispatch({
        type: Types.TIMELINE_SELECTION_CHANGED,
        start,
        end
      });
      return;
    }
    if (state.workerState.primeNav) {
      dispatch(primeNav(false));
    }
    const curPath = document.location.pathname;
    const dongleId = getDongleID(curPath) || state.workerState.dongleId;
    const desiredPath = urlForState(dongleId, start, end, false);

    if (state.zoom.start !== start || state.zoom.end !== end) {
      dispatch({
        type: Types.TIMELINE_SELECTION_CHANGED,
        start,
        end
      });
    }

    if (!state.workerState.loop.startTime
      || !state.workerState.loop.duration
      || state.workerState.loop.startTime < start
      || state.workerState.loop.startTime + state.workerState.loop.duration > end
      || state.workerState.loop.duration < end - start) {
      Timelineworker.resetPlayback();
      Timelineworker.selectLoop(start, end - start);
    }

    if (curPath !== desiredPath) {
      dispatch(push(desiredPath));
    }
  };
}

export function selectDevice(dongleId) {
  return (dispatch, getState) => {
    const state = getState();
    if (state.workerState.dongleId !== dongleId) {
      Timelineworker.selectDevice(dongleId).then(() => {
        dispatch(selectRange(null, null))
        dispatch(primeFetchSubscription());
        dispatch(fetchDeviceOnline(dongleId));
      });
    } else {
      dispatch(primeNav(false));
    }

    const curPath = document.location.pathname;
    const desiredPath = urlForState(dongleId, state.zoom.start, state.zoom.end, null);
    if (curPath !== desiredPath) {
      dispatch(push(desiredPath));
    }
  };
}

export function primeFetchSubscription() {
  return (dispatch, getState) => {
    const state = getState();

    if ((state.workerState.device && state.workerState.device.is_owner) || state.workerState.profile.superuser) {
      Billing.getSubscription(state.workerState.dongleId).then((subscription) => {
        Timelineworker.primeGetSubscription(state.workerState.dongleId, subscription);
      }).catch((err) => {
        if (!err.message || err.message.indexOf('404') !== 0) {
          console.log(err);
          Sentry.captureException(err);
        }
      });
    }
  };
}

export function primeNav(nav = true) {
  return (dispatch, getState) => {
    const state = getState();

    if (state.workerState.primeNav != nav) {
      Timelineworker.primeNav(nav);
    }

    const curPath = document.location.pathname;
    const desiredPath = urlForState(state.workerState.dongleId, null, null, nav);
    if (curPath !== desiredPath) {
      dispatch(push(desiredPath));
    }
  };
}

export function fetchDeviceOnline(dongleId) {
  return (dispatch, getState) => {
    DevicesApi.fetchDevice(dongleId).then((resp) => {
      if (resp.dongle_id === dongleId) {
        Timelineworker.updateDeviceOnline(dongleId, resp.last_athena_ping, parseInt(Date.now() / 1000));
      }
    }).catch(console.log);
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
