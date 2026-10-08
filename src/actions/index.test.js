vi.mock('../timeline/playback', () => ({ reducer: state => state, resetPlayback: () => ({ type: 'ACTION_RESET' }), selectLoop: (start, end) => ({ type: 'ACTION_LOOP', start, end }) }));
import { pushTimelineRange, primeNav, streamNav, selectDevice, applyTimelineRange } from './index';
import { CALL_HISTORY_METHOD } from 'connected-react-router';

const D = '0000aaaa0000aaaa';
const L = '2026-08-06--12-00-00';
const state = { dongleId: D, selectedRouteId: L, driveRoutes: {}, routes: [{ log_id: L, duration: 60000 }],
  router: { location: { pathname: `/${D}/${L}`, search: '', hash: '' } } };

function invoke(thunk, current = state) {
  const actions = [];
  const dispatch = (action) => typeof action === 'function' ? action(dispatch, () => current) : actions.push(action);
  thunk(dispatch, () => current);
  return actions;
}

describe('navigation actions', () => {
  it.each([
    [() => selectDevice(D), `/${D}`],
    [() => primeNav(true), `/${D}/prime`],
    [() => streamNav(true), `/${D}/stream`],
    [() => pushTimelineRange(L, 0, 20000), `/${D}/${L}/0/20`],
    [() => pushTimelineRange(L, 123, 1234), `/${D}/${L}/0.123/1.234`],
    [() => pushTimelineRange(null, null, null), `/${D}`],
  ])('only writes history to %s', (action, expected) => {
    expect(invoke(action())).toEqual([{ type: CALL_HISTORY_METHOD, payload: { method: 'push', args: [expected] } }]);
  });
  it('does not add a history entry for the whole drive when already there', () => {
    expect(invoke(pushTimelineRange(L, 0, 60000))).toEqual([]);
  });
  it('preserves paused playback and files when the effective range already matches', () => {
    expect(invoke(applyTimelineRange(L, null), { ...state, zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 }, desiredPlaySpeed: 0 })).toEqual([]);
  });
});
