import { reducer as playbackReducer } from '../timeline/playback';
import initialState from '../initialState';
import globalState from './globalState';

// Pipe the flat root state through global + playback reducers in order.
export default function rootReducer(state = initialState, action) {
  return playbackReducer(globalState(state, action), action);
}
