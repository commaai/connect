import { vi } from 'vitest';
import { push } from 'connected-react-router';

import { navigate, selectDrive } from './index';
import * as Types from './types';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: () => ({ type: 'resetPlayback' }),
  selectLoop: (start, end) => ({ type: 'selectLoop', start, end }),
}));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('navigate', () => {
  const state = { dongleId: DONGLE, router: { location: { pathname: `/${DONGLE}` } } };

  it.each([
    [{ page: 'prime' }, `/${DONGLE}/prime`],
    [{ page: 'referrals' }, '/referrals'],
    [{ logId: LOG, zoom: { start: 10000, end: 20000 } }, `/${DONGLE}/${LOG}/10/20`],
    [{ dongleId: '1111bbbb1111bbbb' }, '/1111bbbb1111bbbb'],
  ])('opens %j', (location, url) => {
    const dispatch = vi.fn();
    navigate(location)(dispatch, () => state);
    expect(dispatch).toHaveBeenCalledWith(push(url));
  });

  it('stays put when already there', () => {
    const dispatch = vi.fn();
    navigate({})(dispatch, () => state);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('selectDrive', () => {
  function select(prevZoom, nextZoom) {
    let zoom = prevZoom;
    const dispatch = vi.fn((action) => {
      if (action.type === Types.ACTION_SELECT_DRIVE) zoom = nextZoom;
    });
    selectDrive(LOG, nextZoom)(dispatch, () => ({ zoom }));
    return dispatch;
  }

  it('restarts playback in a new range', () => {
    const dispatch = select(null, { start: 10000, end: 20000 });
    expect(dispatch).toHaveBeenCalledWith({ type: Types.ACTION_SELECT_DRIVE, logId: LOG, zoom: { start: 10000, end: 20000 } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'resetPlayback' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectLoop', start: 10000, end: 20000 });
  });

  it('keeps playing in the same range', () => {
    const zoom = { start: 10000, end: 20000 };
    const dispatch = select(zoom, zoom);
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
