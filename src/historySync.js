import { drives as Drives } from '@commaai/api';
import { pushTimelineRange, selectDevice } from './actions';
import { replace } from './navigation';
import { getDongleID, getSegmentRange, getZoom } from './url';

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

    if (pathZoom && !pathSegmentRange) {
      try {
        const routesData = await Drives.getRoutesSegments(pathDongleId, pathZoom.start, pathZoom.end);
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1];
          // Replace zoom-only path with canonical segmentRange path (seconds in URL)
          replace(`/${pathDongleId}/${log_id}/${pathZoom.start}/${pathZoom.end}`);
        }
      } catch (err) {
        console.error('Error fetching routes data for log ID conversion', err);
      }
    }

    if (pathSegmentRange) {
      store.dispatch(pushTimelineRange(pathSegmentRange.log_id, pathSegmentRange.start, pathSegmentRange.end, false));
    }

    // Prime view is derived from URL; no store state needed
  }

  // Subscribe to future changes
  history.listen(handle);
  // Handle the current location once on startup
  handle(history.location, 'POP');
}

export default installHistorySync;
