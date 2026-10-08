import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, selectDevice, streamNav } from './index';

function navigate(action, extra = {}) {
  const dispatch = vi.fn();
  action(dispatch, () => ({ dongleId: 'statedongle', router: { location: { pathname: '/statedongle' } }, ...extra }));
  return dispatch;
}

describe('navigation actions', () => {
  it.each([
    [0, 20000, '/statedongle/log/0/20'],
    [10000, 20000, '/statedongle/log/10/20'],
    [0, 60000, '/statedongle/log'],
    [null, null, '/statedongle/log'],
  ])('pushes a range %s to %s', (start, end, expected) => {
    const dispatch = navigate(pushTimelineRange('log', start, end), { routes: [{ log_id: 'log', duration: 60000 }] });
    expect(dispatch).toHaveBeenCalledWith(push(expected));
    expect(dispatch.mock.calls.every(([action]) => !action.type?.includes('SELECTION'))).toBe(true);
  });

  it.each([
    [primeNav(true), '/statedongle/prime'],
    [streamNav(true), '/statedongle/stream'],
    [selectDevice('anotherdongle'), '/anotherdongle'],
    [pushTimelineRange(null, null, null), '/statedongle'],
  ])('only pushes when the URL differs', (action, expected) => {
    const dispatch = navigate(action);
    expect(dispatch.mock.calls.filter(([dispatched]) => dispatched.type === push(expected).type)).toEqual(expected === '/statedongle' ? [] : [[push(expected)]]);
    const same = navigate(action, { router: { location: { pathname: expected } } });
    expect(same).not.toHaveBeenCalledWith(push(expected));
  });
});
