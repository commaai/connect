import zoom from './zoom';
import { reducer as playbackReducer } from '../timeline/playback';
import Segments from '../timeline/segments';
import globalState from '../reducers/globalState';

const reducers = [
  globalState,
  zoom,
  playbackReducer,
  Segments.reducer,
];

export default reducers;
