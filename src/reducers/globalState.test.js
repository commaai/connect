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
    expect(state.zoom).toMatchObject({ start: startTime, end: startTime + duration });
    expect(state.loop).toEqual({ startTime, duration });
  });
});
