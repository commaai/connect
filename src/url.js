// Single URL grammar for the app. parsePath reads it, pathFor writes it.
// Keep both in sync: every path pathFor emits must round-trip through parsePath
// (see url.test.js CANONICAL).
//
//   /
//   /referrals
//   /{dongle}
//   /{dongle}/prime
//   /{dongle}/stream
//   /{dongle}/settings
//   /{dongle}/{route}
//   /{dongle}/{route}/{startSec}/{endSec}
//   /{dongle}/{startMs}/{endMs}   legacy, rewritten to a drive
const DONGLE = /^[a-f0-9]{16}$/;
const ROUTE = /^[a-f0-9-]{20}$/;
const SEC = 1000;

const FULLNAME_SEP = '|';

export const Page = {
  home: 'home',
  referrals: 'referrals',
  device: 'device',
  prime: 'prime',
  stream: 'stream',
  settings: 'settings',
  drive: 'drive',
  legacy: 'legacy',
};

const SEGMENT_PAGE = new Set([Page.prime, Page.stream, Page.settings]);

export function fullnameFor(dongleId, routeId) {
  return `${dongleId}${FULLNAME_SEP}${routeId}`;
}

export function routeIdFromFullname(fullname) {
  return fullname.split(FULLNAME_SEP)[1];
}

function view(name, extra) {
  return { name, dongleId: null, routeId: null, zoom: null, legacy: null, ...extra };
}

// The three overlay flags in state are mutually exclusive derivations of the view.
export function overlayStateForView(parsed) {
  return {
    primeNav: parsed.name === Page.prime,
    streamNav: parsed.name === Page.stream,
    settingsNav: parsed.name === Page.settings,
  };
}

export function parsePath(pathname) {
  const [first, second, third, fourth] = pathname.split('/').filter(Boolean);

  if (first === Page.referrals) return view(Page.referrals);
  if (!first || !DONGLE.test(first)) return view(Page.home);

  const dongleId = first;
  if (!second) return view(Page.device, { dongleId });
  if (!third && SEGMENT_PAGE.has(second)) return view(second, { dongleId });

  if (ROUTE.test(second)) {
    // Non-numeric or half ranges fall back to the whole drive, not to device,
    // so a hand-edited zoom never kicks the user out of the drive.
    const start = Number(third);
    const end = Number(fourth);
    const zoom = third != null && fourth != null && Number.isFinite(start) && Number.isFinite(end)
      ? { start: start * SEC, end: end * SEC }
      : null;
    return view(Page.drive, { dongleId, routeId: second, zoom });
  }

  const legacyStart = Number(second);
  const legacyEnd = Number(third);
  if (third != null && fourth == null && Number.isFinite(legacyStart) && Number.isFinite(legacyEnd)) {
    return view(Page.legacy, { dongleId, legacy: { start: legacyStart, end: legacyEnd } });
  }

  return view(Page.device, { dongleId });
}

function sameSecondRange(a, b) {
  return Math.floor(a.start / SEC) === Math.floor(b.start / SEC)
    && Math.floor(a.end / SEC) === Math.floor(b.end / SEC);
}

// The path stores whole seconds. A selection inside that second keeps its milliseconds.
// pathFor intentionally emits equal-second ranges (end >= start) so they round-trip,
// while zoomToKeep treats them as empty (end > start required) and falls back to the
// whole drive. That asymmetry is deliberate: the path can describe a range the state
// chooses not to keep.
export function zoomToKeep(urlZoom, stateZoom) {
  if (urlZoom && stateZoom && sameSecondRange(urlZoom, stateZoom)) return stateZoom;
  if (!urlZoom || !(urlZoom.end > urlZoom.start)) return null;
  return urlZoom;
}

export function pathFor({ name, dongleId, routeId, zoom } = {}) {
  if (name === Page.referrals) return `/${Page.referrals}`;
  if (!dongleId || name === Page.home) return '/';
  if (SEGMENT_PAGE.has(name)) return `/${dongleId}/${name}`;
  if (name === Page.drive && routeId) {
    if (zoom && Number.isFinite(zoom.start) && Number.isFinite(zoom.end) && zoom.end >= zoom.start) {
      return `/${dongleId}/${routeId}/${Math.floor(zoom.start / SEC)}/${Math.floor(zoom.end / SEC)}`;
    }
    return `/${dongleId}/${routeId}`;
  }
  return `/${dongleId}`;
}
