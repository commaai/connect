import { vi } from 'vitest';

import * as Types from '../actions/types';
import reducer from './globalState';

// globalState imports timeline helpers that read the app store; importing the
// real store here would build it before this reducer module finishes loading.
vi.mock('../store', () => ({ default: { getState: () => ({}) } }));

const LOG = '2026-08-06--12-00-00';
const OTHER_LOG = '2026-08-06--13-00-00';
const route = { log_id: LOG, duration: 60000 };
const otherRoute = { log_id: OTHER_LOG, duration: 30000 };

const navigate = (state, page, logId = null, zoom = null) => reducer(state, {
  type: Types.ACTION_NAVIGATE,
  location: { page, dongleId: null, logId, zoom },
});

describe('ACTION_NAVIGATE', () => {
  const state = {
    page: 'dashboard', routes: [route, otherRoute], selectedRouteId: null, currentRoute: null, zoom: null, files: null,
  };

  it('opens a whole drive', () => {
    expect(navigate(state, 'drive', LOG)).toMatchObject({
      page: 'drive', selectedRouteId: LOG, currentRoute: route, zoom: { start: 0, end: 60000 },
    });
  });

  it('opens a zoomed drive', () => {
    expect(navigate(state, 'drive', LOG, { start: 10000, end: 20000 }).zoom).toEqual({ start: 10000, end: 20000 });
  });

  it('clamps a rounded-up zoom to the end of the drive', () => {
    expect(navigate(state, 'drive', LOG, { start: 50000, end: 61000 }).zoom).toEqual({ start: 50000, end: 60000 });
  });

  it('waits for routes before zooming to a whole drive', () => {
    expect(navigate({ ...state, routes: null }, 'drive', LOG)).toMatchObject({ currentRoute: null, zoom: null });
  });

  it('keeps the loaded drive and its files when only the zoom changes', () => {
    const loaded = { ...route, events: ['loaded'] };
    const files = { [`${LOG}--0/qcameras`]: {} };
    const zoomed = navigate({ ...state, page: 'drive', selectedRouteId: LOG, currentRoute: loaded, files }, 'drive', LOG, { start: 0, end: 5000 });
    expect(zoomed.currentRoute).toBe(loaded);
    expect(zoomed.files).toBe(files);
  });

  it('clears the drive and its files when leaving it', () => {
    const files = { [`${LOG}--0/qcameras`]: {} };
    expect(navigate({ ...state, page: 'drive', selectedRouteId: LOG, currentRoute: route, files }, 'prime')).toMatchObject({
      page: 'prime', selectedRouteId: null, currentRoute: null, zoom: null, files: null,
    });
  });

  it('switches drives', () => {
    expect(navigate({ ...state, page: 'drive', selectedRouteId: LOG, currentRoute: route }, 'drive', OTHER_LOG)).toMatchObject({
      currentRoute: otherRoute, zoom: { start: 0, end: 30000 },
    });
  });
});
