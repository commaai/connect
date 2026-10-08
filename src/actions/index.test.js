import { vi } from 'vitest';
import { push } from 'connected-react-router';

import { resetPlayback, selectLoop } from '../timeline/playback';
import { navigate, selectRoute } from './index';
import * as Types from './types';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(() => ({ type: 'reset' })),
  selectLoop: vi.fn(() => ({ type: 'loop' })),
}));

describe('navigation actions', () => {
  it.each([
    ['/dongle', '/dongle/prime', true],
    ['/dongle', '/dongle', false],
  ])('navigate from %s to %s pushes: %s', (current, url, pushes) => {
    const dispatch = vi.fn();
    navigate(url)(dispatch, () => ({ router: { location: { pathname: current } } }));
    expect(dispatch.mock.calls).toEqual(pushes ? [[push(url)]] : []);
  });

  it('selectRoute restarts playback in the selected range', () => {
    const dispatch = vi.fn();
    const zoom = { start: 10000, end: 20000 };
    selectRoute('log', zoom)(dispatch, () => ({ zoom }));
    expect(dispatch).toHaveBeenCalledWith({ type: Types.ACTION_SELECT_ROUTE, logId: 'log', zoom });
    expect(resetPlayback).toHaveBeenCalled();
    expect(selectLoop).toHaveBeenCalledWith(10000, 20000);
  });
});
