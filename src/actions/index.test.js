import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { navigate, selectRoute } from './index';
import * as Types from './types';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(() => ({ type: 'reset' })),
  selectLoop: vi.fn((start, end) => ({ type: 'loop', start, end })),
}));

const route = { log_id: 'log', duration: 60000 };

function run(thunk, state) {
  const dispatch = vi.fn();
  thunk(dispatch, () => ({
    dongleId: 'statedongle', routes: [route], router: { location: { pathname: '/statedongle' } }, ...state,
  }));
  return dispatch;
}

describe('navigate', () => {
  it.each([
    ['a page of the selected device', { page: 'prime' }, '/statedongle/prime'],
    ['another device', { dongleId: 'other', page: 'settings' }, '/other/settings'],
    ['a drive', { logId: 'log' }, '/statedongle/log'],
    ['part of a drive', { logId: 'log', zoom: { start: 10000, end: 20000 } }, '/statedongle/log/10/20'],
    ['a whole drive by its range', { logId: 'log', zoom: { start: 0, end: 60000 } }, '/statedongle/log'],
  ])('pushes %s', (_name, url, expected) => {
    expect(run(navigate(url))).toHaveBeenCalledWith(push(expected));
  });

  it('does not push the current URL', () => {
    expect(run(navigate({ page: 'dashboard' }))).not.toHaveBeenCalled();
  });
});

describe('selectRoute', () => {
  it('selects the whole drive without a zoom', () => {
    const dispatch = run(selectRoute('log'), { selectedRouteId: null, zoom: null, loop: null });
    expect(dispatch).toHaveBeenCalledWith({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 'log', start: 0, end: 60000 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'loop', start: 0, end: 60000 });
  });

  it('keeps a loop that already covers the new range', () => {
    const dispatch = run(selectRoute('log', { start: 10000, end: 20000 }), {
      selectedRouteId: 'log', zoom: { start: 0, end: 60000 }, loop: { startTime: 10000, duration: 10000 },
    });
    expect(dispatch).toHaveBeenCalledWith({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 'log', start: 10000, end: 20000 });
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('does nothing when the range is already selected', () => {
    const state = { selectedRouteId: 'log', zoom: { start: 10000, end: 20000, previous: null } };
    expect(run(selectRoute('log', { start: 10000, end: 20000 }), state)).not.toHaveBeenCalled();
  });

  it('closes the drive', () => {
    const dispatch = run(selectRoute(null), { selectedRouteId: 'log', zoom: { start: 0, end: 60000 } });
    expect(dispatch).toHaveBeenCalledWith({ type: Types.TIMELINE_PUSH_SELECTION, log_id: null, start: null, end: null });
    expect(dispatch).toHaveBeenCalledWith({ type: 'loop', start: null, end: null });
  });
});
