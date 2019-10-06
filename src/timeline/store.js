import { createStore } from 'redux';
import reduceReducers from 'reduce-reducers';

import { reducer as playbackReducer } from './playback';
import Segments from './segments';
import Reducers from './reducers';

const store = createStore(reduceReducers(playbackReducer, Segments.reducer, Reducers.globalState));

export default store;
