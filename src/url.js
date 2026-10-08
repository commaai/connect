import { DEMO_DONGLE_ID } from './api/demo';

const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const isDeviceId = (value) => dongleIdRegex.test(value) || value === DEMO_DONGLE_ID;
const decimalRegex = /^\d+(?:\.\d+)?$/;

/** @typedef {{start: number, end: number}} Range Milliseconds, relative to a drive. */
/**
 * @typedef {Object} Navigation
 * @property {'dashboard'|'drive'|'prime'|'stream'|'referrals'|'demo'|'auth'|'legacy'} page
 * @property {string|null} dongleId Device in the path; account pages retain the selected device.
 * @property {string|null} routeId
 * @property {Range|null} range
 * @property {Range|null} legacyRange Absolute timestamps in old shared links.
 * @property {string|null} stripeSuccess
 * @property {string|null} stripeCancelled
 */

function parseRange(start, end, scale = 1) {
  if (!decimalRegex.test(start) || !decimalRegex.test(end)) return null;
  const range = { start: Math.round(Number(start) * scale), end: Math.round(Number(end) * scale) };
  return Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end)
    && range.start >= 0 && range.end > range.start ? range : null;
}

/**
 * The only URL parser. Invalid paths fall back to a dashboard; invalid ranges to the whole drive.
 * @returns {Navigation}
 */
export function parseLocation({ pathname = '/', search = '' } = {}) {
  const parts = pathname.split('/').filter(Boolean);
  const dongleId = isDeviceId(parts[0]) ? parts[0] : null;
  const params = new URLSearchParams(search);
  const navigation = {
    page: 'dashboard', dongleId, routeId: null, range: null, legacyRange: null,
    stripeSuccess: params.get('stripe_success'), stripeCancelled: params.get('stripe_cancelled'),
  };

  if (dongleId) {
    if (parts.length === 2 && ['prime', 'stream'].includes(parts[1])) {
      navigation.page = parts[1];
    } else if (logIdRegex.test(parts[1]) && [2, 3, 4].includes(parts.length)) {
      navigation.page = 'drive';
      navigation.routeId = parts[1];
      navigation.range = parseRange(parts[2], parts[3], 1000);
    } else if (parts.length === 3) {
      navigation.legacyRange = parseRange(parts[1], parts[2]);
      if (navigation.legacyRange) navigation.page = 'legacy';
    }
  } else if (parts.length === 1 && ['referrals', 'demo', 'auth'].includes(parts[0])) {
    navigation.page = parts[0];
  }

  return navigation;
}

/** Serialize navigation using seconds in drive URLs, milliseconds everywhere inside the app. */
export function deviceUrl(dongleId) {
  return dongleId ? `/${dongleId}` : '/';
}

export function driveUrl(dongleId, routeId, range = null) {
  if (!routeId) return deviceUrl(dongleId);
  const path = `${deviceUrl(dongleId)}/${routeId}`;
  return range ? `${path}/${range.start / 1000}/${range.end / 1000}` : path;
}
