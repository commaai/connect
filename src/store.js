import * as Redux from 'redux';
import thunk from 'redux-thunk';
import reduceReducers from 'reduce-reducers';

import reducers from './reducers';
import composeEnhancers from './devtools';
import initialState from './initialState';
import { history } from './history';

const store = Redux.createStore(
  reduceReducers(initialState, ...reducers),
  composeEnhancers(Redux.applyMiddleware(
    thunk,
  )),
);

export { history };
export default store;
