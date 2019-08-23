import qs from 'query-string';
import window from 'global/window';
import localforage from 'localforage';

let _isDemo;
export async function init() {
	if (_isDemo !== undefined) return;

	_isDemo = await localforage.getItem('isDemo') === '1' || isDemoQuery();
	return _isDemo;
}
export function isDemoQuery() {
	return qs.parse(window.location.search)['demo'] === '1';
}
export function isDemo() {
  return isDemoQuery() || _isDemo;
}
