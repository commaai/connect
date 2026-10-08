import { reducer as playbackReducer } from '../timeline/playback';
import initialState from '../initialState';
import globalState from './globalState';
import locationReducer from './location';

// Pipe the flat root state through global, location and playback reducers in order.
export default function rootReducer(state = initialState, action) {
  return playbackReducer(locationReducer(globalState(state, action), action), action);
}
