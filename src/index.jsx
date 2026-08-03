import ReactDOM from 'react-dom/client';
import { CssBaseline, MuiThemeProvider } from '@material-ui/core';
import * as Sentry from '@sentry/react';

import './index.css';
import App from './App';
import Theme from './theme';

// Existing installations may still have the old Workbox service worker. The
// retirement worker at /sw.js clears its caches; unregister it once this
// network-loaded version of Connect is running. Installation remains available
// through the web app manifest and does not require a service worker.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration('/').then(async (registration) => {
    await registration?.unregister();

    // Also clean up when the page reaches the network before the retirement
    // worker activates.
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  }).catch((error) => {
    console.error('[PWA] Failed to unregister retired service worker', error);
  });
}

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
