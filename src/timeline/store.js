import { createStore } from 'redux';
import reduceReducers from 'reduce-reducers';

import Playback from './playback';
import Segments from './segments';
import { reducer as initReducer } from './startup'

const store = createStore(reduceReducers(Playback.reducer, Segments.reducer, initReducer));

export default store;
