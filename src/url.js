import { parseUrl } from './routing/routes';
export const getDongleID = (url) => parseUrl(url).dongleId;
export const getZoom = (url) => parseUrl(url).legacyRange;
export const getRouteId = (url) => parseUrl(url).routeId;
export const getRouteZoom = (url) => parseUrl(url).range;
export const getPrimeNav = (url) => parseUrl(url).page === 'prime';
export const getStreamNav = (url) => parseUrl(url).page === 'stream';
