import { connectRouter } from 'connected-react-router';
import { combineReducers } from '@reduxjs/toolkit';
import reduceReducers from 'reduce-reducers';

import { playbackReducer } from './timeline/playback';
import { reducer as segmentsReducers } from './timeline/segments';
import globalState from './globalState';

const reducers = [
  globalState,
  playbackReducer,
  segmentsReducers,
];

const combinedReducers = (history) => combineReducers({
  router: connectRouter(history),
});

const createRootReducer = (initialState, history) => reduceReducers(
  initialState,
  combinedReducers(history),
  ...reducers,
);

export default createRootReducer;
