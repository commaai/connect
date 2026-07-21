// Production consumers use this boundary without knowing whether their data is
// backed by the API directly or adapted into a local demo scenario.
export {
  getRouteFiles,
  getRoutesSegments,
  getRouteVideoSource,
  transformRouteCoords,
  transformRouteEvents,
} from './demo';
