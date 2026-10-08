import { describe, expect, it, vi } from 'vitest';

import * as Types from '../actions/types';
import { createInitialState } from '../initialState';
import reducer from './globalState';

vi.mock('../timeline', () => ({ currentOffset: vi.fn(() => 0) }));

const DONGLE = '0000aaaa0000aaaa';
const FIRST_LOG = '2026-08-06--12-00-00';
const SECOND_LOG = '2026-08-06--13-00-00';

describe('route state', () => {
  it.each([
    ['whole drive', FIRST_LOG, null, null, { start: 0, end: 60000 }],
    ['zero-start range', FIRST_LOG, 0, 20000, { start: 0, end: 20000 }],
    ['later range', FIRST_LOG, 10000, 20000, { start: 10000, end: 20000 }],
    ['unloaded drive', SECOND_LOG, null, null, null],
    ['closed drive', null, null, null, null],
  ])('keeps the loop aligned with the %s selection', (_name, log_id, start, end, zoom) => {
    const state = {
      ...createInitialState(`/${DONGLE}/${FIRST_LOG}`),
      currentRoute: { log_id: FIRST_LOG, duration: 60000 },
      zoom: { start: 10000, end: 20000 },
      loop: { startTime: 10000, duration: 10000 },
    };
    const selected = reducer(state, { type: Types.TIMELINE_PUSH_SELECTION, log_id, start, end });
    expect(selected.zoom).toEqual(zoom);
    expect(selected.loop).toEqual(zoom && { startTime: zoom.start, duration: zoom.end - zoom.start });
  });

  it('keeps an exact drive lookup separate from the dashboard list', () => {
    const dashboardRoute = { fullname: `${DONGLE}|${SECOND_LOG}`, log_id: SECOND_LOG };
    const exactRoute = { duration: 60000, fullname: `${DONGLE}|${FIRST_LOG}`, log_id: FIRST_LOG };
    const state = {
      ...createInitialState(`/${DONGLE}/${FIRST_LOG}`),
      routes: [dashboardRoute],
    };

    const found = reducer(state, {
      type: Types.ACTION_CURRENT_ROUTE,
      logId: FIRST_LOG,
      route: exactRoute,
    });
    expect(found.routes).toBe(state.routes);
    expect(found.currentRoute).toBe(exactRoute);
    expect(found.currentRouteMissing).toBe(false);
    expect(found.zoom).toEqual({ start: 0, end: 60000 });

    const missing = reducer(state, {
      type: Types.ACTION_CURRENT_ROUTE,
      logId: FIRST_LOG,
      route: null,
    });
    expect(missing.routes).toBe(state.routes);
    expect(missing.currentRoute).toBeNull();
    expect(missing.currentRouteMissing).toBe(true);
  });

  it('reuses files only while narrowing the same drive', () => {
    const files = { qcamera: 'cached' };
    const firstRoute = { duration: 60000, log_id: FIRST_LOG };
    const secondRoute = { duration: 60000, log_id: SECOND_LOG };
    const state = {
      ...createInitialState(`/${DONGLE}/${FIRST_LOG}`),
      currentRoute: firstRoute,
      files,
      routes: [firstRoute, secondRoute],
      selectedRouteId: FIRST_LOG,
      zoom: { start: 0, end: 60000 },
    };

    const narrowed = reducer(state, {
      type: Types.TIMELINE_PUSH_SELECTION,
      log_id: FIRST_LOG,
      start: 10000,
      end: 20000,
    });
    expect(narrowed.files).toBe(files);

    const changedDrive = reducer(state, {
      type: Types.TIMELINE_PUSH_SELECTION,
      log_id: SECOND_LOG,
      start: 10000,
      end: 20000,
    });
    expect(changedDrive.files).toBeNull();
  });
});
