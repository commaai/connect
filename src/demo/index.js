const demoDevices = require('./devices.json');

export function isDemoDevice(dongleId) {
  return demoDevices.some((d) => d.dongle_id === dongleId);
}

export function isDemoRoute(route) {
  return route === '4cf7a6ad03080c90|2021-09-29--13-46-36';
}

export function isDemo() {
  if (!window.location || !window.location.pathname) {
    return false;
  }
  return isDemoDevice(window.location.pathname.split('/')[1]);
}
