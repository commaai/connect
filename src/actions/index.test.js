import { vi } from 'vitest';
import { goBack, push } from 'connected-react-router';

import * as Types from './types';
import { closeModal, navigate, selectDrive } from './index';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: () => ({ type: 'reset' }),
  selectLoop: (start, end) => ({ type: 'loop', start, end }),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

function run(thunk, state) {
  const dispatched = [];
  const dispatch = (action) => (typeof action === 'function' ? action(dispatch, () => state) : dispatched.push(action));
  thunk(dispatch, () => state);
  return dispatched;
}

const at = (pathname, state) => ({ dongleId: DONGLE, router: { location: { pathname, state } } });

describe('navigate', () => {
  it.each([
    ['device', undefined, `/${DONGLE}`],
    ['device', { dongleId: OTHER }, `/${OTHER}`],
    ['prime', undefined, `/${DONGLE}/prime`],
    ['drive', { logId: LOG }, `/${DONGLE}/${LOG}`],
    ['drive', { logId: LOG, zoom: { start: 10000, end: 20000 } }, `/${DONGLE}/${LOG}/10/20`],
  ])('goes to %s %j', (page, params, pathname) => {
    expect(run(navigate(page, params), at('/referrals'))).toEqual([push(pathname, undefined)]);
  });

  it('stays put on the current URL', () => {
    expect(run(navigate('prime'), at(`/${DONGLE}/prime`))).toEqual([]);
  });

  it('opens a modal over the current page', () => {
    expect(run(navigate('settings', { dongleId: OTHER }), at(`/${DONGLE}/${LOG}`)))
      .toEqual([push(`/${OTHER}/settings`, { background: `/${DONGLE}/${LOG}` })]);
  });
});

describe('closeModal', () => {
  it('returns to the page the modal was opened over', () => {
    expect(run(closeModal(), at(`/${OTHER}/settings`, { background: `/${DONGLE}/${LOG}` }))).toEqual([goBack()]);
  });

  it('goes to the modal\'s device when its URL was entered directly', () => {
    expect(run(closeModal(), at(`/${OTHER}/settings`))).toEqual([push(`/${OTHER}`, undefined)]);
  });
});

describe('selectDrive', () => {
  const route = { log_id: LOG, duration: 60000 };
  const base = { routes: [route], selectedRouteId: null, zoom: null, loop: null };

  it('shows a drive whole', () => {
    expect(run(selectDrive(LOG, null), base)).toEqual([
      { type: Types.TIMELINE_PUSH_SELECTION, log_id: LOG, start: 0, end: 60000 },
      { type: 'reset' },
      { type: 'loop', start: 0, end: 60000 },
    ]);
  });

  it('zooms in to a range', () => {
    const state = { ...base, selectedRouteId: LOG, zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 } };
    expect(run(selectDrive(LOG, { start: 10000, end: 20000 }), state)).toEqual([
      { type: Types.TIMELINE_PUSH_SELECTION, log_id: LOG, start: 10000, end: 20000 },
      { type: 'reset' },
      { type: 'loop', start: 10000, end: 20000 },
    ]);
  });

  it.each([
    ['whole', null, { start: 0, end: 60000 }],
    ['whole before its route loads', null, null],
    ['zoomed', { start: 10000, end: 20000 }, { start: 10000, end: 20000 }],
  ])('does nothing for the drive already shown %s', (_name, zoom, shown) => {
    const state = { ...base, routes: shown ? [route] : null, selectedRouteId: LOG, zoom: shown };
    expect(run(selectDrive(LOG, zoom), state)).toEqual([]);
  });

  it('does nothing when no drive is shown or asked for', () => {
    expect(run(selectDrive(null, null), base)).toEqual([]);
  });
});
