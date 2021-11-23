import * as Redux from 'redux';
import { connectRouter, routerMiddleware } from 'connected-react-router';
import thunk from 'redux-thunk';
import { createBrowserHistory } from 'history';
import reducers from './reducers';
import composeEnhancers from './devtools';
import reduceReducers from 'reduce-reducers';
import initialState from './initialState';

export const history = createBrowserHistory();

const store = Redux.createStore(
  connectRouter(history)(reduceReducers(initialState, ...reducers)),
  composeEnhancers(Redux.applyMiddleware(thunk, routerMiddleware(history)))
);
export default store;
