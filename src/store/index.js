import { configureStore } from '@reduxjs/toolkit';
import { routerMiddleware } from 'connected-react-router';
import { createBrowserHistory } from 'history';

import createRootReducer from './reducers';
import initialState from './initialState';
import middleware from './middleware';

export const history = createBrowserHistory();

const store = configureStore({
  reducer: createRootReducer(initialState, history),
  preloadedState: initialState,
  middleware: (getDefaultMiddleware) => getDefaultMiddleware()
    .concat(routerMiddleware(history))
    .concat(...middleware),
});

export default store;
