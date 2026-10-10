const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const modals = ['settings', 'add-device', 'filter', 'uploads', 'clip', 'files', 'info', 'clips', 'delete-clip', 'unpair', 'prime-cancel', 'prime-switch'];

function parseRange(start, end, scale = 1) {
  if (start == null || end == null || start === '' || end === '') return null;
  start = Number(start) * scale;
  end = Number(end) * scale;
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start
    ? { start, end } : null;
}

export function parseLocation({ pathname = '/', search = '' }) {
  const parts = pathname.split('/').filter(Boolean);
  const dongleId = dongleIdRegex.test(parts[0]) ? parts[0] : null;
  const selectedRouteId = dongleId && logIdRegex.test(parts[1]) ? parts[1] : null;
  const query = new URLSearchParams(search);
  const modal = modals.includes(query.get('modal')) ? query.get('modal') : null;
  const modalDeviceId = dongleIdRegex.test(query.get('device')) ? query.get('device') : dongleId;
  return {
    page: ['referrals', 'auth', 'demo'].includes(parts[0]) ? parts[0] : 'dashboard',
    dongleId,
    selectedRouteId,
    zoom: selectedRouteId && parts.length === 4 ? parseRange(parts[2], parts[3], 1000) : null,
    legacyZoom: dongleId && !selectedRouteId && parts.length === 3 ? parseRange(parts[1], parts[2]) : null,
    primeNav: Boolean(dongleId && parts.length === 2 && parts[1] === 'prime'),
    streamNav: Boolean(dongleId && parts.length === 2 && parts[1] === 'stream'),
    modal,
    parentModal: modal && ['settings', 'files', 'clips'].includes(query.get('parent')) ? query.get('parent') : null,
    modalDeviceId: modal ? modalDeviceId : null,
    clipFilename: ['clip', 'delete-clip'].includes(modal) ? query.get('clip') : null,
  };
}

export function buildLocation(navigation, search = '') {
  const { page, dongleId, selectedRouteId, zoom, legacyZoom, primeNav, streamNav, modal, parentModal, modalDeviceId, clipFilename } = navigation;
  const parts = dongleId ? [dongleId] : [];
  if (page === 'referrals' || page === 'auth' || (page === 'demo' && !dongleId)) {
    parts.splice(0, parts.length, page);
  } else if (selectedRouteId) {
    parts.push(selectedRouteId);
    if (zoom) parts.push(zoom.start / 1000, zoom.end / 1000);
  } else if (legacyZoom) {
    parts.push(legacyZoom.start, legacyZoom.end);
  } else if (primeNav || streamNav) {
    parts.push(primeNav ? 'prime' : 'stream');
  }
  const query = new URLSearchParams(search);
  ['modal', 'parent', 'device', 'clip'].forEach(key => query.delete(key));
  if (modal) {
    query.set('modal', modal);
    if (parentModal) query.set('parent', parentModal);
    if (modalDeviceId && modalDeviceId !== dongleId) query.set('device', modalDeviceId);
    if (['clip', 'delete-clip'].includes(modal) && clipFilename) query.set('clip', clipFilename);
  }
  const queryString = query.toString();
  return { pathname: `/${parts.join('/')}`, search: queryString ? `?${queryString}` : '' };
}
