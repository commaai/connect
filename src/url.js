const DONGLE = /^[a-f0-9]{16}$/;
const ROUTE = /^[a-f0-9-]{20}$/;

// One grammar for the whole app:
//   /
//   /referrals
//   /{dongle}
//   /{dongle}/prime | stream | settings
//   /{dongle}/{route}
//   /{dongle}/{route}/{startSec}/{endSec}
//   /{dongle}/{startMs}/{endMs}    legacy; rewritten to a drive URL
//
// A new page is a new name here and in pathFor. Nothing else parses paths.
export function parsePath(pathname) {
  const [first, second, third, fourth] = pathname.split('/').filter(Boolean);

  if (first === 'referrals') {
    return { name: 'referrals', dongleId: null, routeId: null, zoom: null };
  }
  if (!first || !DONGLE.test(first)) {
    return { name: 'home', dongleId: null, routeId: null, zoom: null };
  }

  const dongleId = first;
  if (!second) return { name: 'device', dongleId, routeId: null, zoom: null };
  if (!third && (second === 'prime' || second === 'stream' || second === 'settings')) {
    return { name: second, dongleId, routeId: null, zoom: null };
  }

  if (ROUTE.test(second)) {
    const start = Number(third);
    const end = Number(fourth);
    const zoom = third != null && fourth != null && Number.isFinite(start) && Number.isFinite(end)
      ? { start: start * 1000, end: end * 1000 }
      : null;
    return { name: 'drive', dongleId, routeId: second, zoom };
  }

  const legacyStart = Number(second);
  const legacyEnd = Number(third);
  if (third != null && fourth == null && Number.isFinite(legacyStart) && Number.isFinite(legacyEnd)) {
    return {
      name: 'legacy',
      dongleId,
      routeId: null,
      zoom: null,
      legacy: { start: legacyStart, end: legacyEnd },
    };
  }

  return { name: 'device', dongleId, routeId: null, zoom: null };
}

// Builds the path for a view. A zoom that starts at 0 is omitted: that is the
// URL this app already publishes for "from the beginning".
export function pathFor(view) {
  const { name, dongleId, routeId, zoom } = view || {};
  if (name === 'referrals') return '/referrals';
  if (!dongleId || name === 'home') return '/';
  if (name === 'prime' || name === 'stream' || name === 'settings') return `/${dongleId}/${name}`;
  if (name === 'drive' && routeId) {
    if (zoom?.start) {
      return `/${dongleId}/${routeId}/${Math.floor(zoom.start / 1000)}/${Math.floor(zoom.end / 1000)}`;
    }
    return `/${dongleId}/${routeId}`;
  }
  return `/${dongleId}`;
}
