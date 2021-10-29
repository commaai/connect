import * as Redux from 'redux';
import { connectRouter, routerMiddleware } from 'connected-react-router';
import thunk from 'redux-thunk';
import { createBrowserHistory } from 'history';
import reducers from './reducers';
import composeEnhancers from './devtools';
import reduceReducers from 'reduce-reducers';
import initialState from './initialState';
import { onHistoryMiddleware } from './actions/history';

export const history = createBrowserHistory();

let store = null;
if (!store) {
  store = Redux.createStore(
    connectRouter(history)(reduceReducers(initialState, ...reducers)),
    composeEnhancers(Redux.applyMiddleware(thunk, onHistoryMiddleware, routerMiddleware(history)))
  );
}
export default store;
