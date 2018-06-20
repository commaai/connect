import * as Redux from 'redux';
import { routerReducer, routerMiddleware } from 'react-router-redux';
import createHistory from 'history/createBrowserHistory';
import reducers from './reducers';
import { updateState, selectRange } from './actions';
import compose from './devtools';

export const history = createHistory();

export function createStore () {
  const middleware = routerMiddleware(history);

  const store = Redux.createStore(
    Redux.combineReducers({
      ...reducers,
      router: routerReducer
    }),
    compose(Redux.applyMiddleware(middleware))
  );

  history.listen(location => dispatchRoute(location.pathname));
  dispatchRoute(history.location.pathname);

  return store;

  function dispatchRoute (pathname) {
    var parts = pathname.split('/');
    parts = parts.filter((m) => m.length);

    switch (parts[0]) {
      case 'timeline':
        store.dispatch(selectRange(Number(parts[1]), Number(parts[2])));
        break;

      default:
        store.dispatch(selectRange());
        break;
    }

    console.log(parts);
  }
}
