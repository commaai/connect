import * as Types from './types';

export function updateState (data) {
  return {
    type: Types.WORKER_STATE_UPDATE,
    data: data
  };
}

export function selectRange (start, end) {
  return {
    type: Types.TIMELINE_SELECTION_CHANGED,
    start, end
  };
}
