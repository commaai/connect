import { vi } from 'vitest';
import { pushTimelineRange } from './index';
import * as Types from './types';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  selectLoop: vi.fn(),
}));

const LOG = '2026-08-06--12-00-00';

function run(state, ...args) {
  const dispatch = vi.fn();
  pushTimelineRange(...args)(dispatch, () => state);
  return dispatch;
}

describe('timeline actions', () => {
  it('selects a whole drive as its full range', () => {
    const dispatch = run({ routes: [{ log_id: LOG, duration: 60000 }], zoom: null }, LOG, null, null);
    expect(dispatch).toHaveBeenCalledWith({ type: Types.TIMELINE_PUSH_SELECTION, log_id: LOG, start: 0, end: 60000 });
  });

  it('pushes a nested zoom level', () => {
    const zoom = { start: 0, end: 60000, previous: null };
    const dispatch = run({ selectedRouteId: LOG, zoom }, LOG, 10000, 20000);
    expect(dispatch).toHaveBeenCalledWith({ type: Types.TIMELINE_PUSH_SELECTION, log_id: LOG, start: 10000, end: 20000 });
  });

  it('pops back to the previous zoom level', () => {
    const zoom = { start: 12000, end: 15000, previous: { start: 10000, end: 20000 } };
    const dispatch = run({ selectedRouteId: LOG, zoom }, LOG, 10000, 20000);
    expect(dispatch).toHaveBeenCalledWith({ type: Types.TIMELINE_POP_SELECTION });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: Types.TIMELINE_PUSH_SELECTION }));
  });

  it('does nothing for the current zoom level', () => {
    const zoom = { start: 10000, end: 20000, previous: null };
    const dispatch = run({ selectedRouteId: LOG, zoom }, LOG, 10000, 20000);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
