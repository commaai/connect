import { reducer as playbackReducer } from '../timeline/playback';
import globalState from './globalState';

// Combined reducer that applies both reducers sequentially
export default function combinedReducer(state, action) {
  // Apply globalState reducer first
  let newState = globalState(state, action);
  // Then apply playback reducer
  newState = playbackReducer(newState, action);
  return newState;
}
