import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils', () => ({ emptyDevice: {} }));

import * as Types from '../actions/types';
import reducer from './globalState';

const DONGLE = '0000aaaa0000aaaa';
const OTHER_DONGLE = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

const route = {
  log_id: LOG,
  duration: 120000,
};

const baseState = {
  dongleId: DONGLE,
  devices: [{ dongle_id: DONGLE, alias: 'Device 1' }, { dongle_id: OTHER_DONGLE, alias: 'Device 2' }],
  device: { dongle_id: DONGLE, alias: 'Device 1' },
  routes: [route],
  subscription: { id: 'sub_123' },
  settingsOpen: false,
  primeNav: false,
  streamNav: false,
  zoom: null,
  loop: null,
};

describe('ACTION_APPLY_DESTINATION drive', () => {
  it.each([
    ['selects the whole route when the URL has no time range', null, null, 0, route.duration],
    ['uses the time range from the URL as the loop', 10000, 30000, 10000, 20000],
  ])('%s', (_description, start, end, startTime, duration) => {
    const state = reducer(baseState, {
      type: Types.ACTION_APPLY_DESTINATION,
      destination: {
        dongleId: DONGLE,
        page: 'drive',
        drive: { logId: LOG, start, end },
      },
    });

    expect(state.currentRoute).toBe(route);
    expect(state.selectedRouteId).toBe(LOG);
    expect(state.zoom).toMatchObject({ start: startTime, end: startTime + duration });
    expect(state.loop).toEqual({ startTime, duration });
    expect(state.routes).toBe(baseState.routes);
  });
});

describe('ACTION_APPLY_DESTINATION state reuse', () => {
  it('preserves cached routes and device info when navigating to settings for same device', () => {
    const state = reducer(baseState, {
      type: Types.ACTION_APPLY_DESTINATION,
      destination: {
        dongleId: DONGLE,
        page: 'settings',
      },
    });

    expect(state.dongleId).toBe(DONGLE);
    expect(state.settingsOpen).toBe(true);
    expect(state.routes).toBe(baseState.routes);
    expect(state.subscription).toBe(baseState.subscription);
    expect(state.device).toBe(baseState.device);
  });

  it('preserves cached routes and device info when navigating to prime for same device', () => {
    const state = reducer(baseState, {
      type: Types.ACTION_APPLY_DESTINATION,
      destination: {
        dongleId: DONGLE,
        page: 'prime',
      },
    });

    expect(state.dongleId).toBe(DONGLE);
    expect(state.primeNav).toBe(true);
    expect(state.routes).toBe(baseState.routes);
    expect(state.subscription).toBe(baseState.subscription);
  });

  it('clears device caches when switching to a different dongleId', () => {
    const state = reducer(baseState, {
      type: Types.ACTION_APPLY_DESTINATION,
      destination: {
        dongleId: OTHER_DONGLE,
        page: 'dashboard',
      },
    });

    expect(state.dongleId).toBe(OTHER_DONGLE);
    expect(state.routes).toBeNull();
    expect(state.subscription).toBeNull();
    expect(state.device).toEqual({ dongle_id: OTHER_DONGLE, alias: 'Device 2' });
  });
});
