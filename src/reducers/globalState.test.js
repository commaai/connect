import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils', () => ({ emptyDevice: {} }));

import * as Types from '../actions/types';
import reducer from './globalState';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const route = {
  log_id: LOG,
  duration: 120000,
};

const baseState = {
  dongleId: DONGLE,
  routes: [route],
  zoom: null,
  loop: null,
};

describe('ACTION_SELECT_DRIVE', () => {
  it('selects the whole route when the URL has no time range', () => {
    const state = reducer(baseState, {
      type: Types.ACTION_SELECT_DRIVE,
      dongleId: DONGLE,
      logId: LOG,
      start: null,
      end: null,
    });

    expect(state.currentRoute).toBe(route);
    expect(state.zoom).toMatchObject({ start: 0, end: route.duration });
    expect(state.loop).toEqual({ startTime: 0, duration: route.duration });
  });

  it('uses the time range from the URL as the loop', () => {
    const state = reducer(baseState, {
      type: Types.ACTION_SELECT_DRIVE,
      dongleId: DONGLE,
      logId: LOG,
      start: 10000,
      end: 30000,
    });

    expect(state.loop).toEqual({ startTime: 10000, duration: 20000 });
  });
});
