import { createInitialState } from '../initialState';
import { applyUrl } from './location';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

const route = { log_id: LOG, duration: 60000 };

function visit(state, url) {
  const [pathname, search] = url.split('?');
  return applyUrl(state, { pathname, search: search ? `?${search}` : '' });
}

// a dashboard that has finished loading its drives
function loaded() {
  return { ...createInitialState(`/${DONGLE}`), routes: [route], files: {} };
}

describe('applying a url', () => {
  it('starts from the url the app was opened at', () => {
    expect(createInitialState(`/${DONGLE}/${LOG}/10/20`)).toMatchObject({
      page: 'drive', dongleId: DONGLE, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 },
    });
  });

  it('keeps what is loaded while the device stays the same', () => {
    const before = loaded();
    for (const url of [`/${DONGLE}/prime`, `/${DONGLE}/${LOG}`, '/referrals', '/', `/${DONGLE}?settings=${OTHER}`]) {
      const after = visit(before, url);
      expect(after.dongleId).toBe(DONGLE);
      expect(after.routes).toBe(before.routes);
      expect(after.filter).toBe(before.filter);
    }
  });

  it('starts over for another device', () => {
    const after = visit({ ...loaded(), limit: 15 }, `/${OTHER}`);
    expect(after).toMatchObject({ dongleId: OTHER, routes: null, currentRoute: null, limit: 5 });
  });

  it('shows a drive whole unless the url has a range', () => {
    expect(visit(loaded(), `/${DONGLE}/${LOG}`)).toMatchObject({
      page: 'drive', currentRoute: route, zoom: { start: 0, end: 60000 },
    });
    expect(visit(loaded(), `/${DONGLE}/${LOG}/10/20`).zoom).toMatchObject({ start: 10000, end: 20000 });
  });

  it('waits for a drive it has not loaded yet', () => {
    expect(visit(createInitialState('/'), `/${DONGLE}/${LOG}`)).toMatchObject({
      selectedRouteId: LOG, currentRoute: null, zoom: null,
    });
  });

  it('steps back out through the ranges that were zoomed into', () => {
    const whole = visit(loaded(), `/${DONGLE}/${LOG}`);
    const first = visit(whole, `/${DONGLE}/${LOG}/10/50`);
    const second = visit(first, `/${DONGLE}/${LOG}/20/30`);
    expect(second.zoom.previous).toBe(first.zoom);
    expect(visit(second, `/${DONGLE}/${LOG}/10/50`).zoom).toBe(first.zoom);
    expect(visit(first, `/${DONGLE}/${LOG}`).zoom).toBe(whole.zoom);
  });

  it('leaves the drive alone when only settings open over it', () => {
    const before = visit(loaded(), `/${DONGLE}/${LOG}/10/20`);
    const after = visit({ ...before, files: {} }, `/${DONGLE}/${LOG}/10/20?settings=${DONGLE}`);
    expect(after.settingsDongleId).toBe(DONGLE);
    expect(after.zoom).toBe(before.zoom);
    expect(after.currentRoute).toBe(before.currentRoute);
    expect(after.files).not.toBeNull();
  });

  it('closes the drive on the way back to the dashboard', () => {
    const after = visit(visit(loaded(), `/${DONGLE}/${LOG}/10/20`), `/${DONGLE}`);
    expect(after).toMatchObject({ page: 'dashboard', selectedRouteId: null, currentRoute: null, zoom: null, files: null });
  });
});
