import * as Redux from 'redux';
import { connectRouter, routerMiddleware } from 'connected-react-router';
import thunk from 'redux-thunk';
import { createBrowserHistory } from 'history';
import reduceReducers from 'reduce-reducers';

import reducers from './reducers/index.js';
import composeEnhancers from './devtools.js';
import initialState from './initialState.js';
import { onHistoryMiddleware } from './actions/history.js';

export const history = createBrowserHistory();

const middleware = Redux.applyMiddleware(thunk, onHistoryMiddleware, routerMiddleware(history));

const store = Redux.createStore(connectRouter(history)(reduceReducers(initialState, ...reducers)), composeEnhancers(middleware));

export default store;
