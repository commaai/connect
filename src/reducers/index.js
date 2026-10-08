import { reducer as playbackReducer } from '../timeline/playback';
import initialState from '../initialState';
import globalState from './globalState';

// Pipe the flat root state through global + playback reducers in order.
export default function rootReducer(state = initialState, action) {
  const next = playbackReducer(globalState(state, action), action);
  // nothing plays until the drive is known, so a deep link starts at its start
  if (!state.currentRoute && next.currentRoute) {
    return { ...next, startTime: Date.now() };
  }
  return next;
}
