import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyView } from './applyUrl';
import { parseUrl } from './url';
import { getDefaultFilter, ROUTE_PAGE_SIZE } from './utils/filter';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const NEXT = '2026-08-06--13-00-00';

function route(logId, duration = 60000) {
  return { fullname: `${DONGLE}|${logId}`, log_id: logId, dongle_id: DONGLE, duration };
}

function state(overrides = {}) {
  const filter = overrides.filter || getDefaultFilter();
  return {
    dongleId: DONGLE,
    device: { dongle_id: DONGLE, is_owner: true },
    devices: [
      { dongle_id: DONGLE, is_owner: true },
      { dongle_id: OTHER, is_owner: true },
    ],
    filter,
    limit: 15,
    routes: [route(LOG)],
    lastRoutes: null,
    routesMeta: { dongleId: DONGLE, start: filter.start, end: filter.end },
    currentRoute: null,
    selectedRouteId: null,
    zoom: null,
    loop: null,
    files: { kept: true },
    subscription: { id: 'sub' },
    subscribeInfo: { id: 'info' },
    ...overrides,
  };
}

function view(pathname, search = '') {
  return parseUrl(pathname, search);
}

describe('applyView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 6, 12, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['/', '/demo', '/referrals', '/auth/google', '/not-a-page'])('%s does not touch the open device', (pathname) => {
    const current = state({ selectedRouteId: LOG, currentRoute: route(LOG), zoom: { start: 0, end: 60000 } });
    expect(applyView(current, view(pathname))).toEqual({ patch: {}, effects: [] });
  });

  it('ignores query overlays when the page itself is unchanged', () => {
    const current = state({ selectedRouteId: LOG, currentRoute: route(LOG), zoom: { start: 0, end: 60000 } });
    const next = view(`/${DONGLE}/${LOG}`, `?settings=${OTHER}&uploads=1&add=1&filter=1`);
    expect(applyView(current, next)).toEqual({ patch: {}, effects: [] });
  });

  it('selects a device and drops the previous drive', () => {
    const current = state({ selectedRouteId: LOG, currentRoute: route(LOG), zoom: { start: 1, end: 2 } });
    const { patch, effects } = applyView(current, view(`/${OTHER}`));
    expect(patch).toMatchObject({
      dongleId: OTHER,
      device: { dongle_id: OTHER, is_owner: true },
      limit: 0,
      routes: null,
      lastRoutes: null,
      currentRoute: null,
      selectedRouteId: null,
      zoom: null,
      loop: null,
      files: null,
      subscription: null,
      subscribeInfo: null,
      routesMeta: { dongleId: null, start: null, end: null },
    });
    expect(patch.filter).toEqual(getDefaultFilter());
    expect(effects).toEqual([{ type: 'device', dongleId: OTHER, previousId: DONGLE }]);
  });

  it('uses the filter in the URL when the device changes', () => {
    const { patch } = applyView(state(), view(`/${OTHER}`, '?from=3&to=4'));
    expect(patch.filter).toEqual({ start: 3, end: 4 });
  });

  it('refetches the dashboard when the filter changes and no drive is open', () => {
    const current = state();
    const { patch, effects } = applyView(current, view(`/${DONGLE}`, '?from=3&to=4'));
    expect(patch).toMatchObject({
      filter: { start: 3, end: 4 },
      limit: ROUTE_PAGE_SIZE,
      routes: null,
      lastRoutes: current.routes,
      currentRoute: null,
      routesMeta: { dongleId: null, start: null, end: null },
    });
    expect(effects).toEqual([{ type: 'routes' }]);
  });

  it('keeps an open drive when only the filter changes', () => {
    const open = route(LOG);
    const current = state({
      selectedRouteId: LOG,
      currentRoute: open,
      zoom: { start: 0, end: 60000 },
      loop: { startTime: 0, duration: 60000 },
    });
    const { patch, effects } = applyView(current, view(`/${DONGLE}/${LOG}`, '?from=3&to=4'));
    expect(patch.routes).toBeUndefined();
    expect(patch.currentRoute).toBeUndefined();
    expect(patch.selectedRouteId).toBeUndefined();
    expect(patch.zoom).toBeUndefined();
    expect(patch.lastRoutes).toBe(current.routes);
    expect(patch.routesMeta).toEqual({ dongleId: null, start: null, end: null });
    expect(patch.limit).toBe(ROUTE_PAGE_SIZE);
    expect(effects).toEqual([{ type: 'routes' }]);
  });

  it('opens a cached drive without fetching the dashboard', () => {
    const { patch, effects } = applyView(state(), view(`/${DONGLE}/${LOG}`));
    expect(patch).toMatchObject({
      selectedRouteId: LOG,
      currentRoute: route(LOG),
      zoom: { start: 0, end: 60000 },
      loop: null,
      files: null,
    });
    expect(effects).toEqual([{ type: 'drive' }]);
  });

  it('opens a zoom, keeps files when the window shrinks, and drops them when it grows', () => {
    const open = state({
      selectedRouteId: LOG,
      currentRoute: route(LOG),
      zoom: { start: 10000, end: 40000 },
      files: { kept: true },
    });
    const narrower = applyView(open, view(`/${DONGLE}/${LOG}/20/30`));
    expect(narrower.patch.files).toBeUndefined();
    expect(narrower.patch.zoom).toEqual({ start: 20000, end: 30000 });
    expect(narrower.effects).toEqual([{ type: 'zoom' }]);

    const wider = applyView(open, view(`/${DONGLE}/${LOG}/0/50`));
    expect(wider.patch.files).toBeNull();
    expect(wider.patch.zoom).toEqual({ start: 0, end: 50000 });
  });

  it('restores the whole drive from a zoom once the route is cached', () => {
    const open = state({
      selectedRouteId: LOG,
      currentRoute: route(LOG),
      zoom: { start: 10000, end: 20000 },
    });
    const { patch, effects } = applyView(open, view(`/${DONGLE}/${LOG}`));
    expect(patch.zoom).toEqual({ start: 0, end: 60000 });
    expect(patch.files).toBeNull();
    expect(effects).toEqual([{ type: 'zoom' }]);
  });

  it('drops a stale zoom on a whole-drive URL until the route arrives', () => {
    const open = state({
      routes: null,
      selectedRouteId: LOG,
      currentRoute: null,
      zoom: { start: 10000, end: 20000 },
      loop: { startTime: 10000, duration: 10000 },
    });
    const { patch, effects } = applyView(open, view(`/${DONGLE}/${LOG}`));
    expect(patch.zoom).toBeNull();
    expect(patch.loop).toBeNull();
    expect(patch.files).toBeNull();
    expect(effects).toEqual([{ type: 'zoom' }]);
  });

  it('keeps a zero start zoom', () => {
    const open = state({ selectedRouteId: LOG, currentRoute: route(LOG), zoom: { start: 5000, end: 20000 } });
    const { patch } = applyView(open, view(`/${DONGLE}/${LOG}/0/20`));
    expect(patch.zoom).toEqual({ start: 0, end: 20000 });
  });

  it('leaves a drive and keeps a list that already covers the filter', () => {
    const open = state({ selectedRouteId: LOG, currentRoute: route(LOG), zoom: { start: 0, end: 60000 } });
    const { patch, effects } = applyView(open, view(`/${DONGLE}`));
    expect(patch.selectedRouteId).toBeNull();
    expect(patch.currentRoute).toBeNull();
    expect(patch.zoom).toBeNull();
    expect(patch.routes).toBeUndefined();
    expect(patch.lastRoutes).toBeUndefined();
    expect(effects).toEqual([{ type: 'leave-drive' }]);
  });

  it('leaves a cold drive by forgetting the one route that stood in for the list', () => {
    const open = state({
      selectedRouteId: LOG,
      currentRoute: route(LOG),
      zoom: { start: 0, end: 60000 },
      routesMeta: { dongleId: null, start: null, end: null },
      lastRoutes: [route(NEXT)],
    });
    const { patch, effects } = applyView(open, view(`/${DONGLE}`));
    expect(patch.routes).toBeNull();
    expect(patch.lastRoutes).toBeNull();
    expect(effects).toEqual([{ type: 'leave-drive' }]);
  });

  it('asks for a legacy lookup and does not pretend the drive is open', () => {
    const open = state({ selectedRouteId: LOG, currentRoute: route(LOG), zoom: { start: 0, end: 60000 } });
    const { patch, effects } = applyView(open, view(`/${DONGLE}/1000/2000`));
    expect(patch.selectedRouteId).toBeNull();
    expect(patch.currentRoute).toBeNull();
    expect(patch.zoom).toBeNull();
    expect(effects).toEqual([{ type: 'legacy', dongleId: DONGLE, start: 1000, end: 2000 }]);
  });

  it('names the device and the drive in one step', () => {
    const { patch, effects } = applyView(state(), view(`/${OTHER}/${LOG}/10/20`));
    expect(patch.dongleId).toBe(OTHER);
    expect(patch.selectedRouteId).toBe(LOG);
    expect(patch.zoom).toEqual({ start: 10000, end: 20000 });
    expect(patch.routes).toBeNull();
    expect(effects.map((effect) => effect.type)).toEqual(['device', 'drive']);
  });
});
