import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils', () => ({ emptyDevice: { dongle_id: undefined } }));

import * as Types from '../actions/types';
import reducer from './globalState';
import { getDefaultFilter } from '../utils/filter';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const route = { log_id: LOG, duration: 60000 };

const baseState = {
  dongleId: DONGLE,
  destinationKind: 'dashboard',
  selectedRouteId: null,
  currentRoute: null,
  zoom: null,
  loop: null,
  device: { dongle_id: DONGLE },
  devices: [{ dongle_id: DONGLE }, { dongle_id: OTHER }],
  sharedDevice: null,
  routes: [route],
  lastRoutes: null,
  routesMeta: { dongleId: DONGLE, start: 0, end: 1 },
  filter: getDefaultFilter(),
  files: { a: 1 },
  limit: 5,
  primeNav: false,
  streamNav: false,
  settingsOpen: false,
  deviceNotFound: false,
};

const apply = (destination, state = baseState) => reducer(state, {
  type: Types.ACTION_APPLY_DESTINATION,
  destination,
});

describe('ACTION_APPLY_DESTINATION', () => {
  it.each([
    ['selects the whole route when the URL has no range', null, null, 0, 60000],
    ['uses the URL range as the loop', 10000, 30000, 10000, 20000],
  ])('%s', (_name, start, end, loopStart, loopDuration) => {
    const state = apply({ kind: 'drive', dongleId: DONGLE, logId: LOG, start, end });
    expect(state.selectedRouteId).toBe(LOG);
    expect(state.currentRoute).toBe(route);
    expect(state.zoom).toEqual({ start: loopStart, end: loopStart + loopDuration });
    expect(state.loop).toEqual({ startTime: loopStart, duration: loopDuration });
    expect(state.primeNav).toBe(false);
    expect(state.streamNav).toBe(false);
  });

  it('leaves the drive un-hydrated until its routes load', () => {
    const state = apply({ kind: 'drive', dongleId: DONGLE, logId: LOG, start: null, end: null }, {
      ...baseState, routes: null, currentRoute: null,
    });
    expect(state.selectedRouteId).toBe(LOG);
    expect(state.currentRoute).toBeNull();
    expect(state.zoom).toBeNull();
    expect(state.loop).toBeNull();
  });

  it('clears the drive when navigating to the dashboard', () => {
    const state = apply({ kind: 'dashboard', dongleId: DONGLE }, {
      ...baseState, selectedRouteId: LOG, currentRoute: route, zoom: { start: 0, end: 60000 },
    });
    expect(state.selectedRouteId).toBeNull();
    expect(state.currentRoute).toBeNull();
    expect(state.zoom).toBeNull();
    expect(state.loop).toBeNull();
  });

  it('reuses cached data when the device does not change', () => {
    const state = apply({ kind: 'dashboard', dongleId: DONGLE });
    expect(state.filter).toBe(baseState.filter);
    expect(state.routes).toBe(baseState.routes);
    expect(state.limit).toBe(baseState.limit);
    expect(state.files).toBe(baseState.files);
  });

  it('invalidates device-scoped data when the device changes but keeps the filter', () => {
    const state = apply({ kind: 'dashboard', dongleId: OTHER });
    expect(state.filter).toBe(baseState.filter);
    expect(state.routes).toBeNull();
    expect(state.lastRoutes).toBeNull();
    expect(state.limit).toBe(0);
    expect(state.files).toBeNull();
    expect(state.device).toEqual({ dongle_id: OTHER });
  });

  it.each([
    ['settings', 'settingsOpen', true],
    ['prime', 'primeNav', true],
    ['stream', 'streamNav', true],
    ['dashboard', 'settingsOpen', false],
  ])('sets %s view flags', (kind, flag, expected) => {
    const state = apply({ kind, dongleId: DONGLE });
    expect(state[flag]).toBe(expected);
    expect(state.destinationKind).toBe(kind);
  });

  it('marks not-found and clears the device', () => {
    const state = apply({ kind: 'not-found' });
    expect(state.destinationKind).toBe('not-found');
    expect(state.dongleId).toBeNull();
    expect(state.deviceNotFound).toBe(false);
  });

  it('records a missing device', () => {
    const state = reducer(baseState, { type: Types.ACTION_DEVICE_NOT_FOUND, dongleId: OTHER });
    expect(state.deviceNotFound).toBe(true);
    expect(state.destinationKind).toBe('not-found');
    expect(state.dongleId).toBe(OTHER);
    expect(state.device).toBeNull();
  });

  it('backs the selected device with a fetched shared device', () => {
    const shared = { dongle_id: OTHER, shared: true };
    const withShared = reducer(baseState, {
      type: Types.ACTION_UPDATE_SHARED_DEVICE, dongleId: OTHER, device: shared,
    });
    expect(withShared.sharedDevice.dongle_id).toBe(OTHER);
    const state = reducer(withShared, {
      type: Types.ACTION_APPLY_DESTINATION,
      destination: { kind: 'dashboard', dongleId: OTHER },
    });
    expect(state.device.dongle_id).toBe(OTHER);
    // ...but it does not join the owned list.
    expect(state.devices.map((d) => d.dongle_id)).toEqual([DONGLE, OTHER]);
  });

  it('records a route-restricted metadata load', () => {
    const state = reducer(baseState, {
      type: Types.ACTION_ROUTES_METADATA,
      dongleId: DONGLE,
      start: 0,
      end: 1,
      routeOnly: true,
      routes: [route],
    });
    expect(state.routesMeta.routeOnly).toBe(true);
  });
});
