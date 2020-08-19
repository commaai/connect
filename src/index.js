import Raven from 'raven-js';
import React from 'react';
import ReactDOM from 'react-dom';
import document from 'global/document';
import CssBaseline from '@material-ui/core/CssBaseline';
import { MuiThemeProvider } from '@material-ui/core/styles';
import MuiPickersUtilsProvider from 'material-ui-pickers/MuiPickersUtilsProvider';
import DateFnsUtils from 'material-ui-pickers/utils/date-fns-utils';

import './index.css';
import 'react-virtualized/styles.css';
import App from './App';
import Theme from './theme';
import { unregister } from './registerServiceWorker';

if (process.env.NODE_ENV === 'production') {
  Raven.config(
    'https://6a242abfa01b4660aa34f150e87de018@sentry.io/1234624',
    { environment: process.env.NODE_ENV }
  ).install();

  unregister();
}

ReactDOM.render((
  <MuiThemeProvider theme={Theme}>
    <CssBaseline />
    <MuiPickersUtilsProvider utils={DateFnsUtils}>
      <App />
    </MuiPickersUtilsProvider>
  </MuiThemeProvider>
), document.getElementById('root'));
