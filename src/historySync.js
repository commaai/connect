import { getDongleID, getZoom, getSegmentRange, getPrimeNav } from './url';
import { primeNav, selectDevice, pushTimelineRange, updateSegmentRange } from './actions';
import { drives as Drives } from '@commaai/api';

export function installHistorySync(store, history) {
  async function handle(location, action) {
    const state = store.getState();
    const pathname = location.pathname;

    const pathDongleId = getDongleID(pathname);
    if (pathDongleId && pathDongleId !== state.dongleId) {
      store.dispatch(selectDevice(pathDongleId, false));
    }

    const pathZoom = getZoom(pathname);
    const pathSegmentRange = getSegmentRange(pathname);

    if ((pathZoom !== state.zoom) && pathZoom && !pathSegmentRange) {
      try {
        const routesData = await Drives.getRoutesSegments(pathDongleId, pathZoom.start, pathZoom.end);
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1];
          const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;

          store.dispatch(pushTimelineRange(log_id, null, null, true));
          store.dispatch(updateSegmentRange(log_id, 0, duration));
        }
      } catch (err) {
        console.error('Error fetching routes data for log ID conversion', err);
      }
    }

    if (pathSegmentRange !== state.segmentRange) {
      store.dispatch(pushTimelineRange(pathSegmentRange?.log_id, pathSegmentRange?.start, pathSegmentRange?.end, false));
    }

    const pathPrimeNav = getPrimeNav(pathname);
    if (pathPrimeNav !== state.primeNav) {
      store.dispatch(primeNav(pathPrimeNav));
    }
  }

  // Subscribe to future changes
  history.listen(handle);
  // Handle the current location once on startup
  handle(history.location, 'POP');
}

export default installHistorySync;

