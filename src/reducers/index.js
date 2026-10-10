import { reducer as playbackReducer } from '../timeline/playback';
import initialState from '../initialState';
import globalState from './globalState';
import locationReducer from './location';

// Pipe the flat root state through location + global + playback reducers in order.
export default function rootReducer(state = initialState, action) {
  return playbackReducer(globalState(locationReducer(state, action), action), action);
}
