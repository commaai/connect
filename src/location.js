// One location model for the whole app: parse turns a URL into a labeled
// location, build turns a location back into the canonical URL for it.
// Everything else that needs to reason about the address bar goes through
// these functions. Pure module: no Redux, no backend, no window.

import { DEMO_DONGLE_ID } from './api/demo';

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const CANONICAL_INT = /^(0|[1-9]\d*)$/;

const RESERVED_WORDS = ['prime', 'stream', 'settings'];
const PASSTHROUGH_KEYS = ['pair', 'r', 'ci'];

/**
 * @param {{ pathname: string, search?: string }} loc
 */
export function parse(loc) {
  const segments = loc.pathname.split('/').filter(Boolean);
  const params = new URLSearchParams(loc.search || '');
  const passthrough = {};
  for (const key of PASSTHROUGH_KEYS) {
    passthrough[key] = params.get(key);
  }

  if (segments[0] === 'auth') {
    return {
      kind: 'auth',
      code: params.get('code'),
      provider: params.get('provider'),
      state: params.get('state'),
      passthrough,
    };
  }
  if (segments[0] === 'demo') {
    return { kind: 'demo', passthrough };
  }
  if (segments.length === 1 && segments[0] === 'referrals') {
    return { kind: 'referrals', passthrough };
  }
  if (segments.length === 0) {
    return { kind: 'root', passthrough };
  }
  if (!DONGLE_ID.test(segments[0])) {
    return { kind: 'unknown', pathname: loc.pathname, passthrough };
  }
  const dongleId = segments[0];
  if (segments.length === 1) {
    return { kind: 'device', dongleId, passthrough };
  }
  if (segments.length === 2 && RESERVED_WORDS.includes(segments[1])) {
    if (segments[1] === 'prime') {
      return {
        kind: 'prime',
        dongleId,
        stripeCancelled: params.get('stripe_cancelled'),
        stripeSuccess: params.get('stripe_success'),
        passthrough,
      };
    }
    return { kind: segments[1], dongleId, passthrough };
  }
  if (LOG_ID.test(segments[1])) {
    if (segments.length === 2) {
      return { kind: 'drive', dongleId, logId: segments[1], zoom: null, query: {}, passthrough };
    }
    if (segments.length === 4 && CANONICAL_INT.test(segments[2]) && CANONICAL_INT.test(segments[3])) {
      return {
        kind: 'drive',
        dongleId,
        logId: segments[1],
        zoom: { start: Number(segments[2]) * 1000, end: Number(segments[3]) * 1000 },
        query: {},
        passthrough,
      };
    }
  } else if (segments.length === 3 && CANONICAL_INT.test(segments[1]) && CANONICAL_INT.test(segments[2])) {
    return {
      kind: 'legacy',
      dongleId,
      startMs: Number(segments[1]),
      endMs: Number(segments[2]),
      passthrough,
    };
  }
  return { kind: 'unknown', pathname: loc.pathname, passthrough };
}

/**
 * `search` uses history 4's spelling: '' when there is no query, '?' plus the
 * encoded query when there is one.
 *
 * @returns {{ pathname: string, search: string }}
 */
export function build(location) {
  let pathname;
  switch (location.kind) {
    case 'root':
      pathname = '/';
      break;
    case 'auth':
      pathname = '/auth';
      break;
    case 'demo':
      pathname = '/demo';
      break;
    case 'referrals':
      pathname = '/referrals';
      break;
    case 'unknown':
      pathname = location.pathname;
      break;
    case 'device':
      pathname = `/${location.dongleId}`;
      break;
    case 'prime':
    case 'stream':
    case 'settings':
      pathname = `/${location.dongleId}/${location.kind}`;
      break;
    case 'legacy':
      pathname = `/${location.dongleId}/${location.startMs}/${location.endMs}`;
      break;
    case 'drive':
      pathname = `/${location.dongleId}/${location.logId}`;
      if (location.zoom) {
        pathname += `/${Math.floor(location.zoom.start / 1000)}/${Math.floor(location.zoom.end / 1000)}`;
      }
      break;
    default:
      throw new Error(`unknown location kind: ${location.kind}`);
  }

  const declared = [];
  if (location.kind === 'prime') {
    declared.push(['stripe_cancelled', location.stripeCancelled], ['stripe_success', location.stripeSuccess]);
  } else if (location.kind === 'auth') {
    declared.push(['code', location.code], ['provider', location.provider], ['state', location.state]);
  }
  const params = new URLSearchParams();
  for (const [key, value] of declared) {
    if (value != null) params.append(key, value);
  }
  for (const key of PASSTHROUGH_KEYS) {
    const value = location.passthrough?.[key];
    if (value != null) params.append(key, value);
  }
  const query = params.toString();
  return { pathname, search: query ? `?${query}` : '' };
}

/** Semantic parent for the in-app back arrow. Not history.back. */
export function parent(location) {
  switch (location.kind) {
    case 'drive':
      return location.zoom
        ? { kind: 'drive', dongleId: location.dongleId, logId: location.logId, zoom: null, query: {} }
        : { kind: 'device', dongleId: location.dongleId };
    case 'prime':
    case 'stream':
    case 'settings':
    case 'legacy':
      return { kind: 'device', dongleId: location.dongleId };
    case 'demo':
      return { kind: 'device', dongleId: DEMO_DONGLE_ID };
    default:
      return { kind: 'root' };
  }
}

/** gtag page_view template. Pathname only, never the raw query string. */
export function analyticsPath(location) {
  const d = '<dongleId>';
  switch (location.kind) {
    case 'device':
      return `/${d}`;
    case 'demo':
      return '/demo';
    case 'drive': {
      const path = `/${d}/${location.logId}`;
      return location.zoom
        ? `${path}/${Math.floor(location.zoom.start / 1000)}/${Math.floor(location.zoom.end / 1000)}`
        : path;
    }
    case 'legacy':
      return `/${d}/${location.startMs}/${location.endMs}`;
    case 'prime':
      return `/${d}/prime`;
    case 'stream':
      return `/${d}/stream`;
    case 'settings':
      return `/${d}/settings`;
    case 'referrals':
      return '/referrals';
    case 'auth':
      return '/auth';
    case 'root':
      return '';
    case 'unknown': {
      const segments = location.pathname.split('/').filter(Boolean);
      if (DONGLE_ID.test(segments[0] || '')) {
        segments[0] = d;
      }
      return `/${segments.join('/')}`;
    }
    default:
      return '';
  }
}

/** Is the current history location already exactly what we want to write? */
export function historyLocationMatches(current, built) {
  return current.pathname === built.pathname && (current.search || '') === built.search;
}

/** Carry passthrough query keys (pair, r, ci) onto a location being built. */
export function inheritPassthrough(partial, current) {
  const passthrough = { ...partial.passthrough };
  for (const key of PASSTHROUGH_KEYS) {
    if (passthrough[key] === undefined && current?.passthrough) {
      passthrough[key] = current.passthrough[key];
    }
  }
  return { ...partial, passthrough };
}

export function selectLocation(state) {
  return parse(state.router.location);
}
