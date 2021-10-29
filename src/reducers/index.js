import zoom from './zoom';
import { reducer as playbackReducer } from '../timeline/playback';
import { reducer as segmentsReducers } from '../timeline/segments';
import globalState from './globalState';

const reducers = [
  globalState,
  zoom,
  playbackReducer,
  segmentsReducers,
];

export default reducers;
