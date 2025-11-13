import * as Redux from 'redux';
import { connectRouter, routerMiddleware } from 'connected-react-router';
import thunk from 'redux-thunk';
import { createBrowserHistory } from 'history';
import reduceReducers from 'reduce-reducers';

import reducers from './reducers';
import composeEnhancers from './devtools';
import initialState from './initialState';
import { onHistoryMiddleware } from './actions/history';

export const history = createBrowserHistory();

const middleware = Redux.applyMiddleware(thunk, onHistoryMiddleware, routerMiddleware(history));

const store = Redux.createStore(connectRouter(history)(reduceReducers(initialState, ...reducers)), composeEnhancers(middleware));

export default store;
