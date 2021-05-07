import * as Redux from 'redux';
import { connectRouter, routerMiddleware } from 'connected-react-router';
import thunk from 'redux-thunk';
import { createBrowserHistory } from 'history';
import reducers from './reducers';
import composeEnhancers from './devtools';

export const history = createBrowserHistory();

export function createStore() {
  const store = Redux.createStore(
    connectRouter(history)(
      Redux.combineReducers(reducers)
    ),
    composeEnhancers(Redux.applyMiddleware(thunk, routerMiddleware(history)))
  );

  return store;
}
