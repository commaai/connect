import qs from 'query-string';
import window from 'global/window';
import localforage from 'localforage';

let isDemoCached;
export function isDemoQuery() {
  return qs.parse(window.location.search).demo === '1';
}
export async function init() {
  if (isDemoCached !== undefined) return isDemoCached;

  isDemoCached = await localforage.getItem('isDemo') === '1' || isDemoQuery();
  return isDemoCached;
}
export function isDemo() {
  return isDemoQuery() || isDemoCached;
}
