// Parse and build URLs as { base, modal, commands, extensions, hash }.
// Drive bounds use route-relative milliseconds aligned to whole seconds.
// Commands are consumed once; unknown query arguments retain their order.

import { DEMO_DONGLE_ID } from '../api/demo';
import { config as AuthConfig } from '@commaai/my-comma-auth';

export const DONGLE_ID_RE = /^[0-9a-f]{16}$/;
export const LOG_ID_RE = /^[0-9a-f-]{20}$/;
const UINT_RE = /^\d+$/;

export const VIEWS = Object.freeze({
  ROOT: 'root',
  DASHBOARD: 'dashboard',
  DRIVE: 'drive',
  PRIME: 'prime',
  STREAM: 'stream',
  REFERRALS: 'referrals',
  LEGACY_RANGE: 'legacyRange',
  AUTH: 'auth',
  INVALID: 'invalid',
});

// one-shot query arguments, each a singleton
const COMMAND_KEYS = ['pair', 'r', 'stripe_success', 'stripe_cancelled'];
// auth callback arguments, only meaningful on the auth path
const AUTH_KEYS = ['code', 'provider', 'state'];
// extension arguments that survive navigation to a different page
export const GLOBAL_EXTENSION_KEYS = ['ci'];

const emptyBase = (view) => ({ view, dongleId: null, drive: null, legacyRange: null, reason: null });

export const invalidBase = (reason) => ({ ...emptyBase(VIEWS.INVALID), reason });

export function rootBase() {
  return emptyBase(VIEWS.ROOT);
}

export function referralsBase() {
  return emptyBase(VIEWS.REFERRALS);
}

export function deviceBase(view, dongleId) {
  return { ...emptyBase(view), dongleId };
}

export function driveBase(dongleId, logId, start = null, end = null) {
  return { ...emptyBase(VIEWS.DRIVE), dongleId, drive: { logId, start, end } };
}

function secondsToMillis(start, end) {
  if (!UINT_RE.test(start) || !UINT_RE.test(end)) return null;
  const startMs = Number(start) * 1000;
  const endMs = Number(end) * 1000;
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || endMs <= startMs) return null;
  return { start: startMs, end: endMs };
}

function legacyMillis(start, end) {
  if (!UINT_RE.test(start) || !UINT_RE.test(end)) return null;
  const startMs = Number(start);
  const endMs = Number(end);
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || endMs <= startMs) return null;
  return { start: startMs, end: endMs };
}

function splitPath(pathname) {
  const raw = (pathname || '/').split('/').slice(1);
  if (raw.length > 1 && raw[raw.length - 1] === '') raw.pop(); // trailing slash, normalized by the builder
  if (raw.length === 1 && raw[0] === '') return [];
  if (raw.some((part) => part === '')) return null;
  try {
    return raw.map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
}

function parseBase(parts, pathname) {
  if (parts === null) return invalidBase('malformed-path');
  const [first, second, third, fourth] = parts;
  const n = parts.length;

  if (n === 0) return rootBase();
  const callbackPaths = [AuthConfig.AUTH_PATH, AuthConfig.APPLE_REDIRECT_PATH]
    .filter(Boolean)
    .map((path) => path.replace(/\/$/, ''));
  if (callbackPaths.includes(pathname.replace(/\/$/, ''))) return emptyBase(VIEWS.AUTH);
  if (n === 1 && first === 'referrals') return referralsBase();
  if (n === 1 && first === 'demo') return deviceBase(VIEWS.DASHBOARD, DEMO_DONGLE_ID);
  if (!DONGLE_ID_RE.test(first)) return invalidBase('unknown-path');

  if (n === 1) return deviceBase(VIEWS.DASHBOARD, first);
  if (n === 2 && second === 'prime') return deviceBase(VIEWS.PRIME, first);
  if (n === 2 && second === 'stream') return deviceBase(VIEWS.STREAM, first);
  if (LOG_ID_RE.test(second)) {
    if (n === 2) return driveBase(first, second);
    if (n === 4) {
      const range = secondsToMillis(third, fourth);
      return range ? driveBase(first, second, range.start, range.end) : invalidBase('invalid-range');
    }
    return invalidBase('unknown-path');
  }
  if (n === 3 && UINT_RE.test(second) && UINT_RE.test(third)) {
    const range = legacyMillis(second, third);
    if (range) return { ...deviceBase(VIEWS.LEGACY_RANGE, first), legacyRange: range };
    return invalidBase('invalid-range');
  }
  return invalidBase('unknown-path');
}

export function parseLocation({ pathname = '/', search = '', hash = '' } = {}) {
  let base = parseBase(splitPath(pathname), pathname);
  const commands = {};
  const extensions = [];
  const seen = new Set();
  const commandKeys = base.view === VIEWS.AUTH ? [...COMMAND_KEYS, ...AUTH_KEYS] : COMMAND_KEYS;

  for (const [key, value] of new URLSearchParams(search)) {
    if (commandKeys.includes(key)) {
      if (seen.has(key)) {
        base = invalidBase('duplicate-query-key');
      }
      seen.add(key);
      commands[key] = value;
    } else {
      extensions.push([key, value]);
    }
  }

  // an invalid location runs nothing: its commands are dropped with it
  return {
    base,
    modal: null,
    commands: base.view === VIEWS.INVALID ? {} : commands,
    extensions,
    hash: hash === '#' ? '' : hash,
  };
}

function assertDongleId(dongleId) {
  if (!DONGLE_ID_RE.test(dongleId || '')) throw new Error(`invalid dongle id: ${dongleId}`);
}

function buildPath(base) {
  switch (base.view) {
    case VIEWS.ROOT:
      return '/';
    case VIEWS.REFERRALS:
      return '/referrals';
    case VIEWS.DASHBOARD:
      assertDongleId(base.dongleId);
      return `/${base.dongleId}`;
    case VIEWS.PRIME:
    case VIEWS.STREAM:
      assertDongleId(base.dongleId);
      return `/${base.dongleId}/${base.view}`;
    case VIEWS.DRIVE: {
      assertDongleId(base.dongleId);
      const { logId, start, end } = base.drive;
      if (!LOG_ID_RE.test(logId || '')) throw new Error(`invalid log id: ${logId}`);
      if (start == null && end == null) return `/${base.dongleId}/${logId}`;
      // the pure builder only accepts canonical, second-aligned bounds; navigate() rounds
      const range =
        start % 1000 === 0 && end % 1000 === 0 ? secondsToMillis(String(start / 1000), String(end / 1000)) : null;
      if (!range) throw new Error(`invalid drive range: ${start}-${end}`);
      return `/${base.dongleId}/${logId}/${start / 1000}/${end / 1000}`;
    }
    case VIEWS.LEGACY_RANGE: {
      assertDongleId(base.dongleId);
      const range = legacyMillis(String(base.legacyRange?.start), String(base.legacyRange?.end));
      if (!range) throw new Error('invalid legacy range');
      return `/${base.dongleId}/${range.start}/${range.end}`;
    }
    default:
      return null;
  }
}

// Returns the canonical URL for a location, or null when it has none
// (auth callbacks and invalid locations are never rewritten).
export function buildUrl(location) {
  const path = buildPath(location.base);
  if (path === null) return null;
  const params = new URLSearchParams();
  for (const key of COMMAND_KEYS) {
    if (location.commands?.[key] != null) params.append(key, location.commands[key]);
  }
  for (const [key, value] of location.extensions || []) params.append(key, value);
  const search = params.toString();
  return `${path}${search ? `?${search}` : ''}${location.hash || ''}`;
}

export function urlOfRouterLocation({ pathname = '/', search = '', hash = '' } = {}) {
  return `${pathname}${search === '?' ? '' : search}${hash === '#' ? '' : hash}`;
}

export function locationOfUrl(url) {
  const parsed = new URL(url, 'http://connect.invalid');
  return { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash };
}

// A new location for `base` carrying only the arguments that survive
// navigation to a different page.
export function locationFor(base, from = null) {
  return {
    base,
    modal: null,
    commands: {},
    extensions: (from?.extensions || []).filter(([key]) => GLOBAL_EXTENSION_KEYS.includes(key)),
    hash: '',
  };
}

// The same thing on screen: device page or drive (any range), ignoring
// the selection, modal and query.
export function sameResource(a, b) {
  if (!a || !b) return false;
  return a.view === b.view && a.dongleId === b.dongleId && a.drive?.logId === b.drive?.logId;
}

// `base` reached from `from` keeping everything that belongs to the same
// resource (unknown arguments in order, hash) when only the selection
// changes, or only the global arguments when it is a different page.
export function locationForEdit(base, from) {
  if (from && sameResource(from.base, base)) {
    return { base, modal: null, commands: {}, extensions: from.extensions, hash: from.hash };
  }
  return locationFor(base, from);
}

export function withoutCommands(location, keys) {
  const commands = { ...location.commands };
  keys.forEach((key) => delete commands[key]);
  return { ...location, commands };
}

// Same page, ignoring commands, extensions and hash.
export function sameBase(a, b) {
  if (!a || !b) return false;
  const x = a.base;
  const y = b.base;
  return (
    x.view === y.view
    && x.dongleId === y.dongleId
    && x.drive?.logId === y.drive?.logId
    && x.drive?.start === y.drive?.start
    && x.drive?.end === y.drive?.end
    && x.legacyRange?.start === y.legacyRange?.start
    && x.legacyRange?.end === y.legacyRange?.end
  );
}

// An internal path that is safe to redirect to after login.
export function isSafeReturnUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return false;
  try {
    return new URL(url, 'http://connect.invalid').origin === 'http://connect.invalid';
  } catch {
    return false;
  }
}

// Analytics page location with identifiers replaced by placeholders.
export function anonymizedPath(location) {
  const { base } = location;
  switch (base.view) {
    case VIEWS.ROOT:
      return '';
    case VIEWS.DASHBOARD:
      return '/<dongleId>';
    case VIEWS.PRIME:
    case VIEWS.STREAM:
      return `/<dongleId>/${base.view}`;
    case VIEWS.DRIVE:
      return base.drive.start == null ? '/<dongleId>/<logId>' : '/<dongleId>/<logId>/<zoomStart>/<zoomEnd>';
    case VIEWS.LEGACY_RANGE:
      return '/<dongleId>/<zoomStart>/<zoomEnd>';
    case VIEWS.REFERRALS:
      return '/referrals';
    case VIEWS.AUTH:
      return '/auth';
    default:
      return '/<invalid>';
  }
}
