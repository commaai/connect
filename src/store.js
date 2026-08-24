import * as Redux from 'redux';
import { connectRouter, routerMiddleware } from 'connected-react-router';
import thunk from 'redux-thunk';
import { createBrowserHistory } from 'history';

import rootReducer from './reducers';
import composeEnhancers from './devtools';
import { onHistoryMiddleware } from './actions/history';
import { analyticsMiddleware } from './analytics';

export const history = createBrowserHistory();

export function createAppStore(appHistory, preloadedState) {
  return Redux.createStore(
    connectRouter(appHistory)(rootReducer),
    preloadedState,
    composeEnhancers(Redux.applyMiddleware(
      thunk,
      onHistoryMiddleware,
      routerMiddleware(appHistory),
      analyticsMiddleware,
    )),
  );
}

const store = createAppStore(history);

export default store;
