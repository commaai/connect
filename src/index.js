import React from 'react';
import ReactDOM from 'react-dom';
import CssBaseline from '@material-ui/core/CssBaseline';

import './index.css';
import App from './App';
import registerServiceWorker from './registerServiceWorker';

ReactDOM.render((
  <React.Fragment>
    <CssBaseline />
    <App />
  </React.Fragment>
  ), document.getElementById('root'));

registerServiceWorker();
