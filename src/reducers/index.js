import { reducer as playbackReducer } from '../timeline/playback.js';
import globalState from './globalState.js';

const reducers = [globalState, playbackReducer];

export default reducers;
