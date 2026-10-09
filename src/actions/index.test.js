import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { createMemoryHistory } from 'history';
import { routerMiddleware } from 'connected-react-router';
import '../store';
import { primeNav, pushTimelineRange, streamNav, urlForState } from './index';

describe('timeline actions', () => {
  it.each([
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['zero-start drive range', ['dongle', 'log', 0, 20, false], '/dongle/log/0/20'],
    ['Prime', ['dongle', null, null, null, true], '/dongle/prime'],
  ])('generates a %s URL', (_name, args, expected) => {
    expect(urlForState(...args)).toBe(expected);
  });

  test.each([
    [pushTimelineRange('log_id', 123, 1234), '/statedongle/log_id/0.123/1.234'],
    [primeNav(true), '/statedongle/prime'],
    [streamNav(true), '/statedongle/stream'],
  ])('navigates to %s while retaining only the validated filter', (action, pathname) => {
    const history = createMemoryHistory({ initialEntries: ['/statedongle?from=1000&to=9000&unrelated=value'] });
    const state = { dongleId: 'statedongle', router: { location: history.location } };
    const store = createStore((current = state) => current, applyMiddleware(thunk, routerMiddleware(history)));
    store.dispatch(action);
    expect(history.location).toMatchObject({ pathname, search: '?from=1000&to=9000' });
    expect(history.length).toBe(2);
  });
});
