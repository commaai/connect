/* eslint-disable no-param-reassign */
import extend from 'xtend';

import { WORKER_STATE_UPDATE } from '../actions/types';

const initialState = {
};

export default function workerState(state = initialState, action) {
  switch (action.type) {
    case WORKER_STATE_UPDATE:
      return extend(state, action.data);
    default:
      return state;
  }
}
