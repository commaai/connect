import * as Redux from 'redux';
import { routerReducer, routerMiddleware } from 'react-router-redux';
import thunk from 'redux-thunk';
import createHistory from 'history/createBrowserHistory';
import reducers from './reducers';
import { updateState, selectRange } from './actions';
import compose from './devtools';
import Timelineworker from './timeline';

export const history = createHistory();

export function createStore () {
  const store = Redux.createStore(
    Redux.combineReducers({
      ...reducers,
      router: routerReducer
    }),
    compose(Redux.applyMiddleware(thunk, routerMiddleware(history)))
  );

  history.listen(location => dispatchRoute(location.pathname));
  dispatchRoute(history.location.pathname);

  return store;

  function dispatchRoute (pathname) {
    var parts = pathname.split('/');
    parts = parts.filter((m) => m.length);

    Timelineworker.selectDevice(parts[0]);
    store.dispatch(selectRange(Number(parts[1]), Number(parts[2])));
  }
}
