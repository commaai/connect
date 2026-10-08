import { DEMO_DONGLE_ID } from '../api/demo';

export function dashboardSelection(dongleId) {
  return {
    page: dongleId ? 'dashboard' : 'home', dongleId,
    logId: null, zoom: null, legacyRange: null,
    demo: dongleId === DEMO_DONGLE_ID,
  };
}

export function driveSelection(dongleId, logId) {
  return { ...dashboardSelection(dongleId), page: 'drive', logId };
}
