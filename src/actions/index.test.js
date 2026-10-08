import { vi } from 'vitest';
import { selectDrive } from './index';
import { TIMELINE_PUSH_SELECTION } from './types';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(() => ({ type: 'reset' })),
  selectLoop: vi.fn((start, end) => ({ type: 'loop', start, end })),
}));

function run(thunk, state) {
  const dispatch = vi.fn();
  thunk(dispatch, () => state);
  return dispatch.mock.calls.map(([action]) => action);
}

describe('selectDrive', () => {
  it('selects a zoomed drive and loops it', () => {
    const dispatched = run(selectDrive('log_id', { start: 1000, end: 2000 }), { zoom: null, loop: null, selectedRouteId: null });
    expect(dispatched).toEqual([
      { type: TIMELINE_PUSH_SELECTION, log_id: 'log_id', start: 1000, end: 2000 },
      { type: 'reset' },
      { type: 'loop', start: 1000, end: 2000 },
    ]);
  });

  it.each([
    ['a zoomed drive', { start: 1000, end: 2000 }, { start: 1000, end: 2000 }],
    ['a zoom starting at 0', { start: 0, end: 2000 }, { start: 0, end: 2000 }],
    ['the whole drive', null, { start: 0, end: 60000 }],
    ['no drive', null, null],
  ])('does nothing when %s is already shown', (name, zoom, shownZoom) => {
    const logId = name === 'no drive' ? null : 'log_id';
    const state = { selectedRouteId: logId, zoom: shownZoom, routes: [{ log_id: 'log_id', duration: 60000 }] };
    expect(run(selectDrive(logId, zoom), state)).toEqual([]);
  });

  it('deselects the drive', () => {
    const dispatched = run(selectDrive(null, null), { selectedRouteId: 'log_id', zoom: { start: 0, end: 2000 }, loop: null });
    expect(dispatched[0]).toEqual({ type: TIMELINE_PUSH_SELECTION, log_id: null, start: null, end: null });
  });
});
