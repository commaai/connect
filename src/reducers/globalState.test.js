import { describe, expect, it, vi } from 'vitest';

// Break the utils -> timeline -> store import cycle (same reason other
// suites mock adjacent modules); the reducer under test never uses it.
vi.mock('../timeline', () => ({ currentOffset: () => 0 }));

import reducer from './globalState';
import * as Types from '../actions/types';

const DONGLE_A = '0000aaaa0000aaaa';
const DONGLE_B = '1111bbbb1111bbbb';
const LOG_A = '2026-08-06--12-00-00';
const LOG_B = '2026-08-06--13-00-00';

const routeA = {
  fullname: `${DONGLE_A}|${LOG_A}`,
  dongle_id: DONGLE_A,
  log_id: LOG_A,
  duration: 60000,
};
const routeB = {
  fullname: `${DONGLE_B}|${LOG_B}`,
  dongle_id: DONGLE_B,
  log_id: LOG_B,
  duration: 60000,
};

const filesA = {
  [`${DONGLE_A}|${LOG_A}--0/cameras`]: { url: 'https://files.example.com/a0' },
  [`${DONGLE_A}|${LOG_A}--0/logs`]: { url: 'https://files.example.com/a0log' },
};

function deviceState(dongleId, routes) {
  return {
    dongleId,
    filter: { start: 1, end: 2 },
    primeNav: false,
    streamNav: false,
    subscription: { user_id: 'u' },
    subscribeInfo: null,
    files: { ...filesA },
    filesUploading: {},
    limit: 5,
    devices: [{ dongle_id: DONGLE_A }, { dongle_id: DONGLE_B }],
    device: { dongle_id: dongleId },
    routesMeta: { dongleId, start: 1, end: 2 },
    routes,
    lastRoutes: null,
    currentRoute: null,
    selectedRouteId: null,
    zoom: null,
    loop: null,
  };
}

describe('state reuse across navigation', () => {
  it('retains namespaced files when switching devices', () => {
    const next = reducer(deviceState(DONGLE_A, [routeA]), {
      type: Types.ACTION_SELECT_DEVICE,
      dongleId: DONGLE_B,
    });
    expect(next.dongleId).toBe(DONGLE_B);
    expect(next.files).toEqual(filesA);
  });

  it('retains the displayed route list while a new filter loads', () => {
    const next = reducer(deviceState(DONGLE_A, [routeA]), {
      type: Types.ACTION_SELECT_TIME_FILTER,
      start: 10,
      end: 20,
    });
    expect(next.filter).toEqual({ start: 10, end: 20 });
    expect(next.routes).toEqual([routeA]);
    expect(next.lastRoutes).toEqual([routeA]);
    expect(next.routesMeta).toEqual({ dongleId: null, start: null, end: null });
  });

  it('retains files when narrowing to a range outside the previous zoom', () => {
    const state = {
      ...deviceState(DONGLE_A, [routeA]),
      zoom: { start: 10000, end: 20000 },
      selectedRouteId: LOG_A,
      currentRoute: routeA,
    };
    const next = reducer(state, {
      type: Types.TIMELINE_PUSH_SELECTION,
      log_id: LOG_A,
      start: 0,
      end: 60000,
    });
    expect(next.selectedRouteId).toBe(LOG_A);
    expect(next.files).toEqual(filesA);
  });

  it('retains prior route files when opening another route', () => {
    const state = {
      ...deviceState(DONGLE_A, [routeA]),
      zoom: { start: 0, end: 60000 },
      selectedRouteId: LOG_A,
      currentRoute: routeA,
    };
    const next = reducer(state, {
      type: Types.TIMELINE_PUSH_SELECTION,
      log_id: LOG_B,
      start: null,
      end: null,
    });
    expect(next.selectedRouteId).toBe(LOG_B);
    expect(next.files).toEqual(filesA);
  });
});

describe('stale-data guards that must keep working', () => {
  it('clears single-slot device data on device switch', () => {
    const next = reducer(deviceState(DONGLE_A, [routeA]), {
      type: Types.ACTION_SELECT_DEVICE,
      dongleId: DONGLE_B,
    });
    expect(next.routes).toBeNull();
    expect(next.lastRoutes).toBeNull();
    expect(next.currentRoute).toBeNull();
    expect(next.subscription).toBeNull();
    expect(next.subscribeInfo).toBeNull();
    expect(next.routesMeta).toEqual({ dongleId: null, start: null, end: null });
  });

  it('clears the selected route on filter change', () => {
    const state = { ...deviceState(DONGLE_A, [routeA]), currentRoute: routeA, selectedRouteId: LOG_A };
    const next = reducer(state, {
      type: Types.ACTION_SELECT_TIME_FILTER,
      start: 10,
      end: 20,
    });
    expect(next.currentRoute).toBeNull();
    expect(next.routesMeta).toEqual({ dongleId: null, start: null, end: null });
  });

  it('never shows device B routes while device A data is retained', () => {
    const switched = reducer(deviceState(DONGLE_A, [routeA]), {
      type: Types.ACTION_SELECT_DEVICE,
      dongleId: DONGLE_B,
    });
    expect(switched.routes).toBeNull();
    const withBRoutes = reducer(switched, {
      type: Types.ACTION_ROUTES_METADATA,
      dongleId: DONGLE_B,
      start: 1,
      end: 2,
      routes: [routeB],
    });
    expect(withBRoutes.routes).toEqual([routeB]);
    expect(withBRoutes.routesMeta.dongleId).toBe(DONGLE_B);
  });
});
