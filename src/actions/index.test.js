import { vi } from 'vitest';
import * as Types from './types';
import { selectDrive } from './index';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(() => ({ type: 'reset' })),
  selectLoop: vi.fn((start, end) => ({ type: 'loop', start, end })),
}));

const route = { log_id: 'log', duration: 60000 };

describe('selectDrive', () => {
  it('selects a zoom and moves the loop into it', () => {
    const dispatch = vi.fn();
    selectDrive('log', { start: 10000, end: 20000 })(dispatch, () => ({ loop: null, zoom: null }));
    expect(dispatch).toHaveBeenCalledWith({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 'log', start: 10000, end: 20000 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'loop', start: 10000, end: 20000 });
  });

  it.each([
    ['the same zoom', { start: 10000, end: 20000 }, { start: 10000, end: 20000 }],
    ['the whole drive', null, { start: 0, end: 60000 }],
  ])('keeps state for %s', (_name, zoom, current) => {
    const dispatch = vi.fn();
    selectDrive('log', zoom)(dispatch, () => ({ selectedRouteId: 'log', currentRoute: route, zoom: current }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('clears the drive', () => {
    const dispatch = vi.fn();
    selectDrive(null, null)(dispatch, () => ({ selectedRouteId: 'log', currentRoute: route, zoom: { start: 0, end: 60000 } }));
    expect(dispatch).toHaveBeenCalledWith({ type: Types.TIMELINE_PUSH_SELECTION, log_id: null, start: null, end: null });
  });
});
