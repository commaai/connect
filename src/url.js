const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const numberRegex = /^\d+$/;
const HOME = { kind: 'home', dongleId: null };

function parsePath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [a, b, c, d] = parts;
  if (!a) return HOME;
  if (a === 'referrals' && parts.length === 1) return { kind: 'referrals', dongleId: null };
  if (!dongleIdRegex.test(a)) return HOME;

  const dongleId = a;
  if (!b) return { kind: 'device', dongleId };
  if ((b === 'prime' || b === 'stream') && parts.length === 2) return { kind: b, dongleId };
  if (logIdRegex.test(b)) {
    const range = numberRegex.test(c) && numberRegex.test(d)
      ? { start: Number(c) * 1000, end: Number(d) * 1000 }
      : null;
    return { kind: 'drive', dongleId, logId: b, range };
  }
  if (parts.length === 3 && numberRegex.test(b) && numberRegex.test(c)) {
    return { kind: 'legacyRange', dongleId, start: Number(b), end: Number(c) };
  }
  return { kind: 'device', dongleId };
}

export function parseLocation({ pathname, search = '' }) {
  const page = parsePath(pathname);
  const query = new URLSearchParams(search);
  const settings = query.has('settings') ? (query.get('settings') || page.dongleId) : null;
  return { ...page, settings: dongleIdRegex.test(settings) ? settings : null };
}

function pathFor(page) {
  switch (page.kind) {
    case 'home':
      return '/';
    case 'referrals':
      return '/referrals';
    case 'device':
      return `/${page.dongleId}`;
    case 'prime':
    case 'stream':
      return `/${page.dongleId}/${page.kind}`;
    case 'drive': {
      const range = page.range ? `/${Math.floor(page.range.start / 1000)}/${Math.floor(page.range.end / 1000)}` : '';
      return `/${page.dongleId}/${page.logId}${range}`;
    }
    default:
      throw new Error(`cannot format page kind ${page.kind}`);
  }
}

export function pagePath(page, search = '') {
  const query = new URLSearchParams();
  if (page.kind === 'prime') {
    const current = new URLSearchParams(search);
    for (const key of ['stripe_success', 'stripe_cancelled']) {
      if (current.has(key)) query.set(key, current.get(key));
    }
  }
  let queryString = query.toString();
  if (page.settings) {
    const settings = page.settings === page.dongleId ? 'settings' : `settings=${page.settings}`;
    queryString = queryString ? `${queryString}&${settings}` : settings;
  }
  return queryString ? `${pathFor(page)}?${queryString}` : pathFor(page);
}

let cachedLocation = null;
let cachedPage = null;

export function selectPage(state) {
  const { location } = state.router;
  if (location !== cachedLocation) {
    cachedLocation = location;
    cachedPage = parseLocation(location);
  }
  return cachedPage;
}
