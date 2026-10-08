import { LOCATION_CHANGE } from 'connected-react-router';

import locationReducer from './location';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const route = { log_id: LOG, duration: 60000 };

const go = (state, pathname) => locationReducer(state, { type: LOCATION_CHANGE, payload: { location: { pathname } } });

const loaded = () => go({ dongleId: null, devices: [{ dongle_id: DONGLE }] }, `/${DONGLE}`);

describe('location reducer', () => {
  it('selects the device from the URL', () => {
    expect(loaded()).toMatchObject({ page: 'dashboard', dongleId: DONGLE, device: { dongle_id: DONGLE }, routes: null });
  });

  it('keeps everything loaded when only the page changes', () => {
    const before = { ...loaded(), routes: [route], files: {} };
    const after = go(before, `/${DONGLE}/prime`);
    expect(after.page).toBe('prime');
    for (const key of ['routes', 'files', 'device', 'filter', 'loop']) expect(after[key]).toBe(before[key]);
  });

  it('drops what belongs to the old device when switching', () => {
    const state = go({ ...loaded(), routes: [route], subscription: {} }, `/${OTHER}`);
    expect(state).toMatchObject({ dongleId: OTHER, device: null, routes: null, subscription: null });
  });

  it('keeps the device on a page without one', () => {
    expect(go(loaded(), '/referrals')).toMatchObject({ page: 'referrals', dongleId: DONGLE });
  });

  it('opens a whole drive and loops over it', () => {
    const state = go({ ...loaded(), routes: [route] }, `/${DONGLE}/${LOG}`);
    expect(state).toMatchObject({
      page: 'drive', selectedRouteId: LOG, currentRoute: route,
      zoom: { start: 0, end: 60000, previous: null }, loop: { startTime: 0, duration: 60000 },
    });
  });

  it('steps in and back out of a zoom, reusing state', () => {
    const whole = go({ ...loaded(), routes: [route], files: {} }, `/${DONGLE}/${LOG}`);
    const outer = go(whole, `/${DONGLE}/${LOG}/10/50`);
    const inner = go(outer, `/${DONGLE}/${LOG}/20/30`);
    expect(inner.zoom).toEqual({ start: 20000, end: 30000, previous: outer.zoom });
    expect(inner.files).toBe(whole.files);
    expect(outer.zoom.previous).toBeNull();

    const back = go(inner, `/${DONGLE}/${LOG}/10/50`);
    expect(back.zoom).toBe(outer.zoom);
    expect(back.files).toBeNull();
    expect(go(back, `/${DONGLE}/${LOG}`).zoom).toEqual(whole.zoom);
  });

  it('leaves playback alone when the drive and zoom are unchanged', () => {
    const drive = go({ ...loaded(), routes: [route] }, `/${DONGLE}/${LOG}/10/50`);
    const again = go({ ...drive, offset: 1234 }, `/${DONGLE}/${LOG}/10/50`);
    expect(again.zoom).toBe(drive.zoom);
    expect(again.offset).toBe(1234);
  });

  it('waits for the route before showing a whole drive', () => {
    expect(go(loaded(), `/${DONGLE}/${LOG}`)).toMatchObject({ selectedRouteId: LOG, currentRoute: null, zoom: null, loop: null });
  });

  it('stops playback when leaving a drive', () => {
    const drive = go({ ...loaded(), routes: [route] }, `/${DONGLE}/${LOG}`);
    expect(go(drive, `/${DONGLE}`)).toMatchObject({ selectedRouteId: null, currentRoute: null, zoom: null, loop: null, desiredPlaySpeed: 0 });
  });
});
