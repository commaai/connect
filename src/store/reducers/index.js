import { connectRouter } from 'connected-react-router';
import { combineReducers } from '@reduxjs/toolkit';

import { playbackReducer } from './timeline/playback';

const createRootReducer = (initialState, history) => combineReducers({
  router: connectRouter(history),
  playback: playbackReducer,
});

export default createRootReducer;
