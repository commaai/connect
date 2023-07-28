import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, MuiThemeProvider } from '@material-ui/core';
import * as Sentry from '@sentry/react';

import './index.css';
import App from './App';
import Theme from './theme';

if (window.SENTRY_ENV) {
  Sentry.init({
    dsn: 'https://6a242abfa01b4660aa34f150e87de018@o33823.ingest.sentry.io/1234624',
    environment: window.SENTRY_ENV,
    maxValueLength: 1000,
    release: import.meta.env.VITE_APP_GIT_SHA,
  });
}

console.info('mode:', import.meta.env.MODE || 'unknown');
console.info('connect version:', import.meta.env.VITE_APP_GIT_SHA || 'dev');
if (import.meta.env.VITE_APP_GIT_COMMIT_TIMESTAMP) {
  console.info('commit date:', import.meta.env.VITE_APP_GIT_COMMIT_TIMESTAMP || 'unknown');
}

ReactDOM.createRoot(document.getElementById('root')).render((
  <MuiThemeProvider theme={Theme}>
    <CssBaseline />
    <App />
  </MuiThemeProvider>
));
