import { createStore } from 'redux';
import reduceReducers from 'reduce-reducers';

import Playback from './playback';
import Segments from './segments';

const store = createStore(reduceReducers(Playback.reducer, Segments.reducer));

export default store;
