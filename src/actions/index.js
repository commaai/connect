import { push } from 'react-router-redux'
import document from 'global/document'
import * as Types from './types';

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
    var desiredPath = [state.workerState.dongleId];

    if (start && end) {
      desiredPath.push(start);
      desiredPath.push(end);
    }
    desiredPath = desiredPath.join('/');

    debugger;

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
