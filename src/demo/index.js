import demoDevices from './devices.json';

export function isDemoDevice(dongleId) {
  return demoDevices.some((d) => d.dongle_id === dongleId);
}

export function isDemoRoute(route) {
  return route === 'a2a0ccea32023010|2023-07-27--13-01-19';
}

export function isDemo() {
  if (!window.location || !window.location.pathname) {
    return false;
  }
  return isDemoDevice(window.location.pathname.split('/')[1]);
}
