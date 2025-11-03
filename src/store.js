import * as Redux from 'redux';
import thunk from 'redux-thunk';
import composeEnhancers from './devtools';
import { history } from './history';
import initialState from './initialState';
import rootReducer from './reducers';

const store = Redux.createStore(
  rootReducer,
  initialState,
  composeEnhancers(Redux.applyMiddleware(
    thunk,
  )),
);

export { history };
export default store;
