import * as Redux from 'redux';
import { connectRouter, routerMiddleware } from 'connected-react-router';
import thunk from 'redux-thunk';
import { createBrowserHistory } from 'history';
import reduceReducers from 'reduce-reducers';

import reducers from './reducers';
import composeEnhancers from './devtools';
import initialState from './initialState';
import { onHistoryMiddleware } from './actions/history';
import { analyticsMiddleware } from './analytics';

export const history = createBrowserHistory();

const store = Redux.createStore(
  connectRouter(history)(reduceReducers(initialState, ...reducers)),
  composeEnhancers(Redux.applyMiddleware(
    thunk,
    onHistoryMiddleware,
    routerMiddleware(history),
    analyticsMiddleware,
  )),
);

export default store;
