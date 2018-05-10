import * as Redux from 'redux';
import { routerReducer, routerMiddleware } from 'react-router-redux';
import createHistory from 'history/createBrowserHistory';
import reducers from './reducers';
import TimelineWorker from './timeline';
import { updateState } from './actions';

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

  TimelineWorker.onStateChange(dispatchState);

  return store;

  function dispatchState (data) {
    store.dispatch(updateState(data));
  }
}
