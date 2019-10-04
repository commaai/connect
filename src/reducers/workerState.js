import extend from 'xtend';
import { WORKER_STATE_UPDATE } from '../actions/types';

const initialState = {
};

export default function workerState(_state = initialState, action) {
  let state = _state;
  switch (action.type) {
    case WORKER_STATE_UPDATE:
      state = extend(state, action.data);
      break;
    default:
      return state;
  }

  return state;
}
