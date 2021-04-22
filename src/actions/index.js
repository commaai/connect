import { push } from 'connected-react-router';
import document from 'global/document';
import * as Types from './types';
import Timelineworker from '../timeline';
import { getDongleID, getPrimeNav } from '../url';

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
      Timelineworker.selectDevice(dongleId);
    }

    const curPath = document.location.pathname;
    if (getPrimeNav(curPath)) {
      dispatch({
        type: Types.PRIME_NAV,
        payload: null,
      });
    }

    const desiredPath = urlForState(dongleId, state.zoom.start, state.zoom.end, null);
    if (curPath !== desiredPath) {
      dispatch(push(desiredPath));
    }
  };
}

export function primeNav(page) {
  return (dispatch, getState) => {
    const state = getState();

    if (state.prime.nav !== page) {
      dispatch({
        type: Types.PRIME_NAV,
        payload: page,
      });
    }

    const curPath = document.location.pathname;
    const desiredPath = urlForState(state.workerState.dongleId, null, null, page);
    if (curPath !== desiredPath) {
      dispatch(push(desiredPath));
    }
  };
}

function urlForState(dongleId, start, end, prime_nav) {
  const path = [dongleId];

  if (start && end) {
    path.push(start);
    path.push(end);
  } else if (prime_nav) {
    path.push('prime');
    path.push(prime_nav);
  }

  return `/${path.join('/')}`;
}
