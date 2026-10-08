const segment = (pattern, read = String, write = String) => ({ pattern, read, write });
const seconds = (round) => segment(/\d+/, (text) => Number(text) * 1000, (ms) => round(ms / 1000));

const PARAMS = {
  dongleId: segment(/[a-f0-9]{16}/),
  logId: segment(/[a-f0-9-]{20}/),
  start: seconds(Math.floor),
  end: seconds(Math.ceil),
  startMs: segment(/\d+/, Number),
  endMs: segment(/\d+/, Number),
};

const PARAM = /:(\w+)/g;

const route = (page, path) => {
  const names = [...path.matchAll(PARAM)].map((match) => match[1]);
  const source = path.replace(PARAM, (_, name) => `(${PARAMS[name].pattern.source})`);
  return { page, path, names, pattern: new RegExp(`^/${source}/?$`) };
};

const ROUTES = [
  route('home', ''),
  route('referrals', 'referrals'),
  route('dashboard', ':dongleId'),
  route('prime', ':dongleId/prime'),
  route('stream', ':dongleId/stream'),
  route('drive', ':dongleId/:logId/:start/:end'),
  route('drive', ':dongleId/:logId'),
  route('legacy', ':dongleId/:startMs/:endMs'),
];

export const PUBLIC_PAGES = new Set(['drive', 'legacy']);

export const NOWHERE = {
  page: null,
  dongleId: null,
  logId: null,
  start: null,
  end: null,
  startMs: null,
  endMs: null,
  dialog: null,
  device: null,
};

export function parseUrl({ pathname, search = '' }) {
  const query = new URLSearchParams(search);
  const place = { ...NOWHERE, page: 'not-found', dialog: query.get('dialog'), device: query.get('device') };
  const found = ROUTES.find(({ pattern }) => pattern.test(pathname));
  if (!found) return place;
  const values = found.pattern.exec(pathname).slice(1);
  found.names.forEach((name, i) => { place[name] = PARAMS[name].read(values[i]); });
  return { ...place, page: found.page };
}

export function formatUrl(place) {
  const found = ROUTES.find(({ page, names }) => page === place.page && names.every((name) => place[name] != null));
  const path = found ? found.path.replace(PARAM, (_, name) => PARAMS[name].write(place[name])) : '';
  const query = new URLSearchParams();
  if (place.dialog) query.set('dialog', place.dialog);
  if (place.device) query.set('device', place.device);
  const search = query.toString();
  return search ? `/${path}?${search}` : `/${path}`;
}
