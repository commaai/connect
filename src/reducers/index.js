import { reducer as playbackReducer } from '../timeline/playback';
import { createInitialState } from '../initialState';
import globalState from './globalState';
import navigationReducer from './navigation';

export default function rootReducer(state = createInitialState(), action) {
  return playbackReducer(globalState(navigationReducer(state, action), action), action);
}
