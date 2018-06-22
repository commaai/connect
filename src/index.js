import React from 'react';
import ReactDOM from 'react-dom';
import document from 'global/document';
import CssBaseline from '@material-ui/core/CssBaseline';
import { MuiThemeProvider } from '@material-ui/core/styles';
import MuiPickersUtilsProvider from 'material-ui-pickers/utils/MuiPickersUtilsProvider';
import DateFnsUtils from 'material-ui-pickers/utils/date-fns-utils';

import './index.css';
import App from './App';
import Theme from './theme';
import registerServiceWorker from './registerServiceWorker';

ReactDOM.render((
  <MuiThemeProvider theme={Theme}>
    <CssBaseline />
    <MuiPickersUtilsProvider utils={DateFnsUtils}>
      <App />
    </MuiPickersUtilsProvider>
  </MuiThemeProvider>
  ), document.getElementById('root'));

registerServiceWorker();
