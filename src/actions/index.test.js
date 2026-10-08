import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { navigate, selectRoute } from './index';
import { resetPlayback, selectLoop } from '../timeline/playback';
import * as Types from './types';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(() => 'resetPlayback'),
  selectLoop: vi.fn(() => 'selectLoop'),
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn((url) => ({ push: url })),
  };
});

const route = { log_id: 'log', duration: 60000 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('navigate', () => {
  it('pushes a new URL', () => {
    const dispatch = vi.fn();
    navigate('/dongle/prime')(dispatch, () => ({ router: { location: { pathname: '/dongle' } } }));
    expect(dispatch).toHaveBeenCalledWith(push('/dongle/prime'));
  });

  it('does not push the current URL again', () => {
    const dispatch = vi.fn();
    navigate('/dongle')(dispatch, () => ({ router: { location: { pathname: '/dongle' } } }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('selectRoute', () => {
  it.each([
    ['the whole drive', 'log', null, { start: 0, end: 60000 }],
    ['a zoom', 'log', { start: 10000, end: 20000 }, { start: 10000, end: 20000 }],
    ['a drive that is not loaded yet', 'other', null, null],
    ['no drive', null, null, null],
  ])('selects %s and restarts playback', (_name, logId, zoom, expected) => {
    const dispatch = vi.fn();
    selectRoute(logId, zoom)(dispatch, () => ({ routes: [route], selectedRouteId: 'previous', zoom: null }));
    expect(dispatch.mock.calls).toEqual([
      [{ type: Types.ACTION_SELECT_ROUTE, logId, zoom: expected }],
      ['resetPlayback'],
      ['selectLoop'],
    ]);
    expect(selectLoop).toHaveBeenCalledWith(expected?.start, expected?.end);
  });

  it('keeps playing when nothing changes', () => {
    const dispatch = vi.fn();
    selectRoute('log')(dispatch, () => ({ routes: [route], selectedRouteId: 'log', zoom: { start: 0, end: 60000 } }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(resetPlayback).not.toHaveBeenCalled();
  });
});
