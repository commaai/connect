import * as Redux from 'redux';
import { connectRouter, routerMiddleware } from 'connected-react-router';
import thunk from 'redux-thunk';
import { createBrowserHistory } from 'history';
import reducers from './reducers';
import compose from './devtools';

export const history = createBrowserHistory();

export function createStore() {
  const store = Redux.createStore(
    connectRouter(history)(
      Redux.combineReducers(reducers)
    ),
    compose(Redux.applyMiddleware(thunk, routerMiddleware(history)))
  );

  return store;
}
