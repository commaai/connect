/* eslint-disable @typescript-eslint/no-misused-promises */
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
  }
}
