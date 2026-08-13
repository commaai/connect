import * as Redux from 'redux';
import { connectRouter, routerMiddleware } from 'connected-react-router';
import thunk from 'redux-thunk';
import { createBrowserHistory } from 'history';

import rootReducer from './reducers';
import composeEnhancers from './devtools';
import { onHistoryMiddleware } from './actions/history';
import { analyticsMiddleware } from './analytics';
import { webrtcMiddleware } from './webrtcMiddleware';

export const history = createBrowserHistory();

const store = Redux.createStore(
  connectRouter(history)(rootReducer),
  composeEnhancers(Redux.applyMiddleware(
    thunk,
    onHistoryMiddleware,
    routerMiddleware(history),
    analyticsMiddleware,
    webrtcMiddleware,
  )),
);

export default store;
