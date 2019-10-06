import window from 'global/window';
import { compose } from 'redux';
import * as Actions from './actions';

function getComposeEnhancers() {
  if (process.env.NODE_ENV !== 'production' && window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) {
    return window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({
      actionCreators: Object.values(Actions).filter((f) => f.name !== 'updateState')
    });
  }
  return compose;
}

const composeEnhancers = getComposeEnhancers();

export default composeEnhancers;
