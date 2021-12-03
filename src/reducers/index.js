import { reducer as playbackReducer } from '../timeline/playback';
import { reducer as segmentsReducers } from '../timeline/segments';
import globalState from './globalState';

const reducers = [
  globalState,
  playbackReducer,
  segmentsReducers,
];

export default reducers;
