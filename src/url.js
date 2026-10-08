// Every URL connect understands, and the one place it is parsed:
//
//   /referrals
//   /:dongleId                      device dashboard
//   /:dongleId/prime                (also stream)
//   /:dongleId/:logId               whole drive
//   /:dongleId/:logId/:start/:end   part of a drive, in seconds from its start, to the millisecond (12.345)
//   /:dongleId/:start/:end          legacy link to a time range, in milliseconds
//
// The path names the page; ?dialog= names one dialog over it, and other query
// parameters and the hash are kept:
//
//   ?dialog=settings                settings of the selected device (owner or superuser)
//   ?dialog=uploads                 upload queue of the selected device
//   ?dialog=add-device              pair a device by scanning its QR code
//   ?dialog=clips                   clips menu of the dashboard or drive shown
//   ?dialog=clips&clip=:filename    one clip on the device, playing
//   ?dialog=filter                  date range of the dashboard drive list
//
// A dialog renders only where its page does, so one on another page is ignored.
// Dialog URLs only open UI: unpairing, deleting a clip and changing Prime are
// confirmed inside their dialog and have no URL. The one link that acts is
// ?pair=:token, the QR code on a device, which pairs it as before.
//
// Anything else names no page; a valid dongle id still selects that device.
const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const PAGES = ['prime', 'stream'];
const DIALOGS = ['settings', 'uploads', 'add-device', 'clips', 'filter'];

// seconds with up to three decimals, read as whole milliseconds; the decimals are never scaled, so it is exact
function parseSeconds(text) {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(text);
  return match && Number(match[1]) * 1000 + Number(match[2]?.padEnd(3, '0') ?? 0);
}

function parseMilliseconds(text) {
  return /^\d+$/.test(text) ? Number(text) : null;
}

function parseRange(start, end, parseTime) {
  const range = { start: parseTime(start), end: parseTime(end) };
  // a safe end bounds the start too; digits too long for a number are not safe
  return range.start !== null && Number.isSafeInteger(range.end) && range.start < range.end ? range : null;
}

// The inverse of parseSeconds: milliseconds as seconds, with only the decimals they need.
export function formatSeconds(milliseconds) {
  const ms = Math.round(milliseconds);
  const decimals = String(ms % 1000).padStart(3, '0').replace(/0+$/, '');
  return decimals ? `${Math.floor(ms / 1000)}.${decimals}` : String(ms / 1000);
}

export function parseUrl(pathname, search = '') {
  const parts = pathname.split('/').filter(Boolean);
  const query = new URLSearchParams(search);
  const dialog = DIALOGS.includes(query.get('dialog')) ? query.get('dialog') : null;
  const clip = dialog === 'clips' ? query.get('clip') || null : null;
  const url = { dongleId: null, page: null, logId: null, zoom: null, legacyZoom: null, dialog, clip };

  if (parts.length === 1 && parts[0] === 'referrals') {
    return { ...url, page: 'referrals' };
  }
  if (!DONGLE_ID.test(parts[0])) {
    return url;
  }

  url.dongleId = parts[0];
  if (parts.length === 2 && PAGES.includes(parts[1])) {
    url.page = parts[1];
  } else if (LOG_ID.test(parts[1])) {
    url.logId = parts[1];
    url.zoom = parseRange(parts[2], parts[3], parseSeconds);
  } else if (parts.length === 3) {
    url.legacyZoom = parseRange(parts[1], parts[2], parseMilliseconds);
  }
  return url;
}

// The URL of the shown page with `dialog` (and `clip`) over it, or with no dialog.
export function dialogUrl({ pathname, search, hash }, dialog, clip) {
  const query = new URLSearchParams(search);
  query.delete('dialog');
  query.delete('clip');
  if (dialog) {
    query.set('dialog', dialog);
  }
  if (clip) {
    query.set('clip', clip);
  }
  const rest = query.toString();
  return `${pathname}${rest && `?${rest}`}${hash || ''}`;
}
