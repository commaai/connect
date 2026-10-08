export const OUTSIDE_DRIVE_RANGE_ERROR = 'This time range is outside the drive.';

// The URL supplies the requested range; metadata supplies the playable bounds.
// Keep this shared by cold metadata arrival and navigation to cached drives.
export function resolveDriveRange(requested, route) {
  if (!route) return { zoom: requested, error: null };
  const { duration } = route;
  if (!(duration > 0) || (requested && requested.start >= duration)) {
    return { zoom: null, error: OUTSIDE_DRIVE_RANGE_ERROR };
  }
  return {
    zoom: requested ? { start: requested.start, end: Math.min(requested.end, duration) } : { start: 0, end: duration },
    error: null,
  };
}
