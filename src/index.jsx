import ReactDOM from 'react-dom/client';
import { CssBaseline, MuiThemeProvider } from '@material-ui/core';
import posthog from 'posthog-js';
import * as Sentry from '@sentry/react';

import './index.css';
import App from './App';
import Theme from './theme';

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_POSTHOG_HOST,
  advanced_disable_flags: true,
  autocapture: false,
  capture_dead_clicks: false,
  capture_exceptions: false,
  capture_heatmaps: false,
  capture_pageleave: false,
  capture_pageview: true,
  capture_performance: false,
  disable_conversations: true,
  disable_product_tours: true,
  disable_session_recording: true,
  disable_surveys: true,
  disable_web_experiments: true,
  // debug: true,
  opt_in_site_apps: false,
});

if (import.meta.env.VITE_SENTRY_ENV) {
  Sentry.init({
    dsn: 'https://6a242abfa01b4660aa34f150e87de018@o33823.ingest.sentry.io/1234624',
    environment: import.meta.env.VITE_SENTRY_ENV,
    maxValueLength: 1000,
    release: import.meta.env.VITE_APP_GIT_SHA,
  });
}

console.info('mode:', import.meta.env.MODE || 'unknown');
console.info('connect version:', import.meta.env.VITE_APP_GIT_SHA || 'dev');
if (import.meta.env.VITE_APP_GIT_TIMESTAMP) {
  console.info('commit date:', import.meta.env.VITE_APP_GIT_TIMESTAMP);
}

ReactDOM.createRoot(document.getElementById('root')).render((
  <MuiThemeProvider theme={Theme}>
    <CssBaseline />
    <App />
  </MuiThemeProvider>
));
