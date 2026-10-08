import { describe, expect, it } from 'vitest';

import { applyLocation } from './location';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const route = { log_id: LOG, duration: 60000 };

const state = {
  dongleId: DONGLE,
  device: { dongle_id: DONGLE },
  devices: [{ dongle_id: DONGLE }, { dongle_id: OTHER }],
  filter: { start: 1, end: 2 },
  limit: 10,
  routes: [route],
  routesMeta: { dongleId: DONGLE, start: 1, end: 2 },
  lastRoutes: [],
  subscription: { plan: 'data' },
  files: { file: {} },
  page: null,
  selectedRouteId: null,
  currentRoute: null,
  zoom: null,
};

describe('applyLocation', () => {
  it('keeps the device data when moving between its pages', () => {
    const next = applyLocation(state, { dongleId: DONGLE, page: 'prime' });
    expect(next).toEqual({ ...state, page: 'prime' });
  });

  it('keeps the current device for a URL without one', () => {
    expect(applyLocation(state, { page: 'referrals' })).toEqual({ ...state, page: 'referrals' });
  });

  it('switches device', () => {
    const next = applyLocation(state, { dongleId: OTHER });
    expect(next).toMatchObject({
      dongleId: OTHER,
      device: { dongle_id: OTHER },
      limit: 0,
      routes: null,
      routesMeta: { dongleId: null, start: null, end: null },
      lastRoutes: null,
      subscription: null,
      files: null,
    });
    expect(next.filter).not.toBe(state.filter);
  });

  it('switches to a device that is not in the list', () => {
    expect(applyLocation(state, { dongleId: 'cccccccccccccccc' }).device).toBeNull();
  });

  it('opens a whole drive', () => {
    const next = applyLocation(state, { dongleId: DONGLE, logId: LOG });
    expect(next).toMatchObject({ selectedRouteId: LOG, currentRoute: route, zoom: { start: 0, end: 60000 }, files: null });
  });

  it('opens part of a drive', () => {
    const next = applyLocation(state, { dongleId: DONGLE, logId: LOG, zoom: { start: 1000, end: 2000 } });
    expect(next).toMatchObject({ selectedRouteId: LOG, currentRoute: route, zoom: { start: 1000, end: 2000 } });
  });

  it('waits for a drive that has not loaded to show all of it', () => {
    const next = applyLocation({ ...state, routes: null }, { dongleId: DONGLE, logId: LOG });
    expect(next).toMatchObject({ selectedRouteId: LOG, currentRoute: null, zoom: null });
  });

  it('keeps the files of a drive when zooming within it', () => {
    const viewing = { ...state, selectedRouteId: LOG, currentRoute: route, zoom: { start: 0, end: 60000 } };
    const next = applyLocation(viewing, { dongleId: DONGLE, logId: LOG, zoom: { start: 1000, end: 2000 } });
    expect(next).toMatchObject({ currentRoute: route, files: state.files, zoom: { start: 1000, end: 2000 } });
  });

  it('closes a drive', () => {
    const viewing = { ...state, selectedRouteId: LOG, currentRoute: route, zoom: { start: 0, end: 60000 } };
    const next = applyLocation(viewing, { dongleId: DONGLE });
    expect(next).toMatchObject({ selectedRouteId: null, currentRoute: null, zoom: null, routes: [route] });
  });
});
