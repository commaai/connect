import { createStore } from 'redux';
import reduceReducers from 'reduce-reducers';

import Playback from './playback';
import Segments from './segments';
import Reducers from './reducers'

const store = createStore(reduceReducers(Playback.reducer, Segments.reducer, Reducers.globalState));

export default store;
