import MyCommaAuth from '@commaai/my-comma-auth';

import * as commaApi from '../api';
import { createDemoBackend, DEMO_DONGLE_ID } from './demo';

export const DEMO_PATH = '/demo';

let backend = null;

// The real backend wraps the existing API calls without changing behavior.
export function createRealBackend() {
  const { fetchDeviceStats, ...devices } = commaApi.devices;
  return {
    auth: {
      isAuthenticated: () => MyCommaAuth.isAuthenticated(),
      logOut: () => MyCommaAuth.logOut(),
      refreshAccessToken: (code, provider) => commaApi.auth.refreshAccessToken(code, provider),
    },
    account: { ...commaApi.account },
    devices,
    routes: { ...commaApi.drives, ...commaApi.raw },
    routeAssets: {
      thumbnail: (route, segment) => `${route.url}/${segment}/sprite.jpg`,
      events: (route, segment) => `${route.url}/${segment}/events.json`,
      coords: (route, segment) => `${route.url}/${segment}/coords.json`,
    },
    stats: { fetchDeviceStats },
    video: { ...commaApi.video },
  };
}

export function selectBackendType(pathname) {
  const demoDevicePath = `/${DEMO_DONGLE_ID}`;
  return (pathname === DEMO_PATH
    || pathname.startsWith(`${DEMO_PATH}/`)
    || pathname === demoDevicePath
    || pathname.startsWith(`${demoDevicePath}/`)) ? 'demo' : 'real';
}

// Select the backend once during startup. /demo and URLs belonging to its
// synthetic device use the demo backend; all other paths use the real backend.
export function initBackend(pathname = window.location.pathname) {
  if (!backend) {
    const realBackend = createRealBackend();
    backend = selectBackendType(pathname) === 'demo' ? createDemoBackend(realBackend) : realBackend;
  }
  return backend;
}

// Call-site facade for the selected backend: api.devices.listDevices(), etc.
// Groups resolve lazily so callers always hit the selected backend.
export const api = {
  get auth() { return initBackend().auth; },
  get account() { return initBackend().account; },
  get devices() { return initBackend().devices; },
  get routes() { return initBackend().routes; },
  get routeAssets() { return initBackend().routeAssets; },
  get stats() { return initBackend().stats; },
  get video() { return initBackend().video; },
};
