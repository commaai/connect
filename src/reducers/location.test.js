import { applyLocation } from './location';

const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
const LOG = '2026-08-06--12-00-00';
const route = { log_id: LOG, duration: 60000 };
const routes = [route];
const loaded = {
  dongleId: A, page: 'dashboard', devices: [{ dongle_id: A }, { dongle_id: B }], device: { dongle_id: A },
  routes, routesMeta: { dongleId: A, start: 1, end: 2 }, currentRoute: null, selectedRouteId: null,
  zoom: null, files: { f: 1 }, filter: { start: 1, end: 2 }, limit: 5,
};

describe('applyLocation', () => {
  it('applying the same url twice changes nothing', () => {
    const once = applyLocation(loaded, `/${A}/${LOG}/10/20`);
    expect(applyLocation(once, `/${A}/${LOG}/10/20`)).toEqual(once);
    expect(applyLocation(once, `/${A}/${LOG}/10/20`).zoom).toBe(once.zoom);
  });

  it('opens a drive from the loaded list without dropping the list', () => {
    const state = applyLocation(loaded, `/${A}/${LOG}`);
    expect(state).toMatchObject({ page: 'drive', selectedRouteId: LOG, currentRoute: route, zoom: { start: 0, end: 60000 } });
    expect(state.routes).toBe(routes);
  });

  it('keeps everything loaded when only the page changes', () => {
    const state = applyLocation(loaded, `/${A}/prime`);
    expect(state).toMatchObject({ page: 'prime', routes, files: { f: 1 }, filter: { start: 1, end: 2 }, limit: 5 });
  });

  it('drops the old device data when the device changes', () => {
    const state = applyLocation(loaded, `/${B}`);
    expect(state).toMatchObject({ dongleId: B, device: { dongle_id: B }, routes: null, files: null, limit: 0 });
  });

  it('takes the range from the url, or the whole drive without one', () => {
    const inner = applyLocation(applyLocation(loaded, `/${A}/${LOG}/10/40`), `/${A}/${LOG}/20/30`);
    expect(inner.zoom).toEqual({ start: 20000, end: 30000 });
    expect(applyLocation(inner, `/${A}/${LOG}`).zoom).toEqual({ start: 0, end: 60000 });
  });

  it('keeps files when zooming in, drops them when zooming out', () => {
    const outer = { ...applyLocation(loaded, `/${A}/${LOG}/10/40`), files: { f: 1 } };
    expect(applyLocation(outer, `/${A}/${LOG}/20/30`).files).toEqual({ f: 1 });
    expect(applyLocation(outer, `/${A}/${LOG}`).files).toBeNull();
  });

  it('keeps the device on pages without one', () => {
    expect(applyLocation(loaded, '/referrals')).toMatchObject({ page: 'referrals', dongleId: A, routes });
  });

  it('waits for the drive list before knowing a whole drive range', () => {
    const state = applyLocation({ ...loaded, routes: null }, `/${A}/${LOG}`);
    expect(state).toMatchObject({ selectedRouteId: LOG, currentRoute: null, zoom: null });
  });
});
