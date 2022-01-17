const demoDevices = require('./devices.json');
const demoSegments = require('./segments.json');

export function isDemo() {
  if (!window.location || !window.location.pathname) {
    return false;
  }
  return isDemoDevice(window.location.pathname.split('/')[1]);
}

export function isDemoDevice(dongleId) {
  return demoDevices.some(d => d.dongle_id === dongleId);
}

export function isDemoRoute(route) {
  return demoSegments[0].canonical_route_name === route;
}
