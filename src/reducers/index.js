import { reducer as playbackReducer } from '../timeline/playback';
import globalState from './globalState';

const reducers = [
  globalState,
  playbackReducer,
];

export default reducers;
