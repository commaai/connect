import { reducer as playbackReducer } from '../timeline/playback';
import initialState from '../initialState';
import globalState from './globalState';
import locationReducer from './location';

// Apply data, URL selection, and playback updates to the flat root state in order.
export default function rootReducer(state = initialState, action) {
  return playbackReducer(locationReducer(globalState(state, action), action), action);
}
