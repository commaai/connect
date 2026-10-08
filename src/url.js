const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^(?:\d{4}-\d{2}-\d{2}--\d{2}-\d{2}-\d{2}|[a-f0-9]{8}--[a-f0-9]{10})$/;
const modals = ['settings', 'pair', 'filter', 'uploads', 'files', 'info', 'clips', 'clip', 'clip-delete', 'unpair', 'prime-plan', 'prime-cancel'];

function parseRange(start, end, scale = 1) {
  if (!/^\d+(?:\.\d+)?$/.test(start) || !/^\d+(?:\.\d+)?$/.test(end)) return null;
  start = Number(start) * scale;
  end = Number(end) * scale;
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

export function parseLocation({ pathname = '/', search = '' } = {}) {
  const parts = pathname.split('/').filter(Boolean);
  const query = new URLSearchParams(search);
  const location = { page: 'home', dongleId: null, logId: null, zoom: null, legacy: null, modal: null, modalDevice: null, clip: null };

  if (parts.length === 1 && ['auth', 'referrals', 'demo'].includes(parts[0])) {
    location.page = parts[0];
  } else if (parts.length) {
    location.page = 'not-found';
    if (dongleIdRegex.test(parts[0])) {
      location.dongleId = parts[0];
      if (parts.length === 1) {
        location.page = 'dashboard';
      } else if (parts.length === 2 && ['prime', 'stream'].includes(parts[1])) {
        location.page = parts[1];
      } else if ([2, 4].includes(parts.length) && logIdRegex.test(parts[1])) {
        const zoom = parts.length === 4 ? parseRange(parts[2], parts[3], 1000) : null;
        if (parts.length === 2 || zoom) {
          Object.assign(location, { page: 'drive', logId: parts[1], zoom });
        }
      } else if (parts.length === 3) {
        const legacy = parseRange(parts[1], parts[2]);
        if (legacy) Object.assign(location, { page: 'legacy', legacy });
      }
    }
  }

  if (modals.includes(query.get('modal'))) location.modal = query.get('modal');
  if (['clip', 'clip-delete'].includes(location.modal)) location.clip = query.get('clip') || null;
  const modalDevice = query.get('device');
  location.modalDevice = dongleIdRegex.test(modalDevice) ? modalDevice : location.dongleId;
  return location;
}

export function urlFor({ dongleId, logId, zoom, page } = {}) {
  if (['auth', 'referrals', 'demo'].includes(page)) return `/${page}`;
  if (!dongleId) return '/';
  if (logId) {
    const range = zoom ? `/${zoom.start / 1000}/${zoom.end / 1000}` : '';
    return `/${dongleId}/${logId}${range}`;
  }
  return `/${dongleId}${['prime', 'stream'].includes(page) ? `/${page}` : ''}`;
}

export function modalLocation(location, modal, device, clip) {
  const query = new URLSearchParams(location.search);
  query.delete('modal');
  query.delete('device');
  query.delete('clip');
  if (modal) query.set('modal', modal);
  if (modal && device) query.set('device', device);
  if (['clip', 'clip-delete'].includes(modal) && clip) query.set('clip', clip);
  const search = query.toString();
  return { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash };
}
