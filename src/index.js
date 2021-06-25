import Raven from 'raven-js';
import React from 'react';
import ReactDOM from 'react-dom';
import document from 'global/document';
import CssBaseline from '@material-ui/core/CssBaseline';
import { MuiThemeProvider } from '@material-ui/core/styles';

import './index.css';
import 'react-virtualized/styles.css';
import App from './App';
import Theme from './theme';
import { register, unregister } from './registerServiceWorker';

if (process.env.REACT_APP_SENTRY_ENV) {
  Raven.config(
    'https://6a242abfa01b4660aa34f150e87de018@sentry.io/1234624',
    { environment: process.env.REACT_APP_SENTRY_ENV }
  ).install();
}

if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_SERVICEWORKER) {
  register();
} else {
  unregister();
}

ReactDOM.render((
  <MuiThemeProvider theme={Theme}>
    <CssBaseline />
    <App />
  </MuiThemeProvider>
), document.getElementById('root'));
