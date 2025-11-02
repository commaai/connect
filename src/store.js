import * as Redux from 'redux';
import thunk from 'redux-thunk';

import rootReducer from './reducers';
import composeEnhancers from './devtools';
import initialState from './initialState';
import { history } from './history';

const store = Redux.createStore(
  rootReducer,
  initialState,
  composeEnhancers(Redux.applyMiddleware(
    thunk,
  )),
);

export { history };
export default store;
