import { push } from 'react-router-redux'
import document from 'global/document'
import * as Types from './types';
import Timelineworker from '../timeline';

export function updateState (data) {
  return {
    type: Types.WORKER_STATE_UPDATE,
    data: data
  };
}

export function selectRange (start, end) {
  return (dispatch, getState) => {
    const state = getState();
    if (!state.workerState.dongleId) {
      return dispatch({
        type: Types.TIMELINE_SELECTION_CHANGED,
        start, end
      });
    }
    const curPath = document.location.pathname;
    var desiredPath = urlForState(state.workerState.dongleId, start, end);

    if (state.zoom.start !== start || state.zoom.end !== end) {
      dispatch({
        type: Types.TIMELINE_SELECTION_CHANGED,
        start, end
      });
    }

    if (curPath !== desiredPath) {
      dispatch(push(desiredPath));
    }
  };
}

export function selectDevice (dongleId) {
  return (dispatch, getState) => {
    const state = getState();
    if (state.workerState.dongleId !== dongleId) {
      Timelineworker.selectDevice(dongleId);
    }
    const curPath = document.location.pathname;
    var desiredPath = urlForState(dongleId, state.zoom.start, state.zoom.end);

    if (curPath !== desiredPath) {
      dispatch(push(desiredPath));
    }
  };
}

function urlForState (dongleId, start, end) {
  var path = [dongleId];

  if (start && end) {
    path.push(start);
    path.push(end);
  }

  return '/' + path.join('/');
}
