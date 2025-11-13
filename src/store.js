import { connectRouter, routerMiddleware } from 'connected-react-router';
import { createBrowserHistory } from 'history';
import reduceReducers from 'reduce-reducers';
import * as Redux from 'redux';
import thunk from 'redux-thunk';
import { onHistoryMiddleware } from './actions/history.js';
import { analyticsMiddleware } from './analytics.js';
import composeEnhancers from './devtools.js';
import initialState from './initialState.js';
import reducers from './reducers/index.js';

export const history = createBrowserHistory();

const store = Redux.createStore(
  connectRouter(history)(reduceReducers(initialState, ...reducers)),
  composeEnhancers(Redux.applyMiddleware(thunk, onHistoryMiddleware, routerMiddleware(history), analyticsMiddleware)),
);

export default store;
