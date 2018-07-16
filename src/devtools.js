import window from 'global/window';
import { compose } from 'redux';
import * as Actions from './actions';

let composeEnhancers;

if (process.env.NODE_ENV !== 'production' && window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) {
  composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({
    actionCreators: Object.values(Actions).filter((f) => f.name !== 'updateState')
  });
} else {
  composeEnhancers = compose;
}

export default composeEnhancers;
