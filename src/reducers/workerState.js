import { WORKER_STATE_UPDATE } from '../actions/types';

const initialState = {};

export default function workerState(_state = initialState, action) {
  let state = _state;
  switch (action.type) {
    case WORKER_STATE_UPDATE:
      for (const [key, value] of Object.entries(action.data)) {
        state[key] = value;
      }
      break;
    default:
      return state;
  }

  return state;
}
