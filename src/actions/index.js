import * as Types from './types';

export function updateState (data) {
  return {
    type: Types.WORKER_STATE_UPDATE,
    data: data
  };
}
