import { pushTimelineRange, primeNav, streamNav, selectDevice } from './index';
const D = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

function destination(action, state = {}) {
  const dispatch = vi.fn();
  action(dispatch, () => ({ dongleId: D, router: { location: { pathname: `/${D}` } }, ...state }));
  return dispatch;
}

describe('navigation actions', () => {
  it('changes the URL without writing selection or playback state', () => {
    const dispatch = destination(pushTimelineRange(LOG, 123, 1234));
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: '@@router/CALL_HISTORY_METHOD', payload: { method: 'push', args: [`/${D}/${LOG}/0.123/1.234`] } });
  });
  it.each([[primeNav, 'prime'], [streamNav, 'stream']])('navigates to a page', (action, page) => {
    expect(destination(action(true)).mock.calls[0][0].payload.args).toEqual([`/${D}/${page}`]);
  });
  it('does nothing when selecting the current dashboard', () => {
    expect(destination(selectDevice(D))).not.toHaveBeenCalled();
  });
  it('uses the whole-drive URL for a whole-range selection', () => {
    expect(destination(pushTimelineRange(LOG, 0, 60000), { routes: [{ log_id: LOG, duration: 60000 }] }).mock.calls[0][0].payload.args).toEqual([`/${D}/${LOG}`]);
  });
});
