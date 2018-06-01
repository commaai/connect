import React from 'react';
import ReactDOM from 'react-dom';
import CssBaseline from '@material-ui/core/CssBaseline';
import { MuiThemeProvider } from '@material-ui/core/styles';
import document from 'global/document';

import './index.css';
import App from './App';
import Theme from './theme';
import registerServiceWorker from './registerServiceWorker';

ReactDOM.render((
  <MuiThemeProvider theme={Theme}>
    <CssBaseline />
    <App />
  </MuiThemeProvider>
  ), document.getElementById('root'));

registerServiceWorker();
