// The URL decides what is on screen. The path picks the page, the query opens dialogs on top of it.
//
//   /referrals                         referrals
//   /:dongleId                         device dashboard
//   /:dongleId/prime                   prime
//   /:dongleId/stream                  body teleop
//   /:dongleId/:routeId                drive, the whole route
//   /:dongleId/:routeId/:start/:end    drive, start and end in seconds into the route
//   /:dongleId/:start/:end             legacy drive link, unix milliseconds
//   ?settings=:dongleId                device settings dialog
//
// Any other path is the dashboard of the selected device.

const DONGLE_ID = /^[a-f0-9]{16}$/;
const ROUTE_ID = /^[a-f0-9-]{20}$/;
const NUMBER = /^\d+$/;

const isNumber = (part) => NUMBER.test(part ?? '');

export function parseLocation({ pathname, search = '' }) {
  const [first, second, third, fourth] = pathname.split('/').filter(Boolean);
  const settings = new URLSearchParams(search).get('settings');
  const nav = {
    page: 'dashboard',
    dongleId: null,
    routeId: null,
    zoom: null,
    legacyZoom: null,
    settings: DONGLE_ID.test(settings ?? '') ? settings : null,
  };

  if (first === 'referrals') {
    return { ...nav, page: 'referrals' };
  }
  if (!DONGLE_ID.test(first ?? '')) {
    return nav;
  }
  nav.dongleId = first;

  if (second === 'prime' || second === 'stream') {
    return { ...nav, page: second };
  }
  if (ROUTE_ID.test(second ?? '')) {
    const isRange = isNumber(third) && isNumber(fourth) && Number(third) < Number(fourth);
    const zoom = isRange ? { start: Number(third) * 1000, end: Number(fourth) * 1000 } : null;
    return { ...nav, page: 'drive', routeId: second, zoom };
  }
  if (isNumber(second) && isNumber(third)) {
    return { ...nav, legacyZoom: { start: Number(second), end: Number(third) } };
  }
  return nav;
}

export function pathFor({ page = 'dashboard', dongleId = null, routeId = null, zoom = null, settings = null }) {
  let path = dongleId ? `/${dongleId}` : '/';
  if (page === 'referrals') {
    path = '/referrals';
  } else if (dongleId && (page === 'prime' || page === 'stream')) {
    path = `/${dongleId}/${page}`;
  } else if (dongleId && page === 'drive' && routeId) {
    path = `/${dongleId}/${routeId}`;
    if (zoom) {
      // round outwards to whole seconds, so a short range never collapses to nothing
      path += `/${Math.floor(zoom.start / 1000)}/${Math.ceil(zoom.end / 1000)}`;
    }
  }
  return settings ? `${path}?settings=${settings}` : path;
}

export const currentNav = (state) => parseLocation(state.router.location);
