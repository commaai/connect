import * as Redux from 'redux';
import { routerReducer, routerMiddleware } from 'react-router-redux';
import createHistory from 'history/createBrowserHistory';
import reducers from './reducers';

export const history = createHistory();

export function createStore () {
  const middleware = routerMiddleware(history);

  const store = Redux.createStore(
    Redux.combineReducers({
      ...reducers,
      router: routerReducer
    }),
    Redux.applyMiddleware(middleware)
  );

  return store;
}
