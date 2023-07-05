import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, MuiThemeProvider } from '@material-ui/core';
import * as Sentry from '@sentry/react';

import './index.css';
import App from './App';
import Theme from './theme';
import ServiceWorkerWrapper from './components/ServiceWorkerWrapper';

if (window.SENTRY_ENV) {
  Sentry.init({
    dsn: 'https://6a242abfa01b4660aa34f150e87de018@o33823.ingest.sentry.io/1234624',
    environment: window.SENTRY_ENV,
    maxValueLength: 1000,
  });
}

console.info('Mode:', import.meta.env.MODE || 'unknown');
console.info('App version:', import.meta.env.VITE_APP_GIT_SHA || 'dev');

ReactDOM.createRoot(document.getElementById('root')).render((
  <MuiThemeProvider theme={Theme}>
    <CssBaseline />
    <App />
    <ServiceWorkerWrapper />
  </MuiThemeProvider>
));
