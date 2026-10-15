import { describe, expect, it, vi } from 'vitest';

import { ACTION_APPLY_DESTINATION } from '../actions/types';
import { createInitialState } from '../initialState';
import reducer from './globalState';

vi.mock('../timeline', () => ({ currentOffset: vi.fn() }));

const DONGLE = 'aaaaaaaaaaaaaaaa';
const LOG = '2026-08-06--12-00-00';
const route = { log_id: LOG, duration: 60000 };
const apply = (state, routeId, range = null) => reducer(state, { type: ACTION_APPLY_DESTINATION, dongleId: DONGLE, routeId, range });

describe('ACTION_APPLY_DESTINATION', () => {
  const onDrive = apply({ ...createInitialState(), devices: [], dongleId: DONGLE, routes: [route], files: {} }, LOG);

  it('opens a whole drive from loaded routes', () => {
    expect(onDrive).toMatchObject({ currentRoute: route, zoom: { start: 0, end: 60000, previous: null } });
  });

  it('keeps loaded files when zooming in and drops them when zooming out', () => {
    const zoomedIn = apply({ ...onDrive, files: { a: 1 } }, LOG, { start: 10000, end: 20000 });
    expect(zoomedIn.files).toEqual({ a: 1 });
    expect(apply(zoomedIn, LOG, { start: 0, end: 30000 }).files).toBeNull();
  });

  it('steps back to the previous zoom instead of stacking it', () => {
    const zoomedIn = apply(onDrive, LOG, { start: 10000, end: 20000 });
    expect(apply(zoomedIn, LOG).zoom).toBe(onDrive.zoom);
  });

  it('keeps device data when navigating within the device', () => {
    expect(apply(onDrive, null)).toMatchObject({ routes: [route], zoom: null, currentRoute: null });
  });
});
