import window from 'global/window';
import { compose } from 'redux';

function getComposeEnhancers() {
  if (process.env.REACT_APP_DEVTOOLS && window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) {
    return window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__;
  }
  return compose;
}

const composeEnhancers = getComposeEnhancers();

export default composeEnhancers;
