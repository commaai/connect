import { push } from 'connected-react-router';

import '../store';

import { popTimelineRange, primeNav, pushTimelineRange, selectDevice, streamNav } from './index';

const DONGLE = 'statedongle';

const LOG = 'log_id';

function run(thunk, state) {
  const actions = [];
  const getState = () => ({ dongleId: DONGLE, routes: null, router: { location: { pathname: '/' } }, ...state });
  const dispatch = (action) => (action instanceof Function ? action(dispatch, getState) : actions.push(action));
  dispatch(thunk);

  return actions;
}

describe('navigation actions', () => {
  it.each([
    ['a range', [LOG, 10_000, 20_000], `/${DONGLE}/${LOG}/10/20`],
    ['a zero-start range', [LOG, 0, 20_000], `/${DONGLE}/${LOG}/0/20`],
    ['the whole drive', [LOG, null, null], `/${DONGLE}/${LOG}`],
    ['the whole drive as a range', [LOG, 0, 60_000], `/${DONGLE}/${LOG}`],
    ['no drive', [null, null, null], `/${DONGLE}`],
  ])('pushTimelineRange pushes %s', (_name, args, expected) => {
    const routes = [{ log_id: LOG, duration: 60_000 }];
    expect(run(pushTimelineRange(...args), { routes })).toEqual([push(expected)]);
  });

  it('popTimelineRange pushes the range below the top of the zoom stack', () => {
    const routes = [{ log_id: LOG, duration: 60_000 }];
    const zoom = { start: 10_000, end: 20_000, previous: { start: 0, end: 60_000, previous: null } };
    expect(run(popTimelineRange(), { routes, zoom, selectedRouteId: LOG })).toEqual([push(`/${DONGLE}/${LOG}`)]);
  });

  it.each([
    ['Prime', primeNav(true), `/${DONGLE}/prime`],
    ['the dashboard from Prime', primeNav(false), `/${DONGLE}`],
    ['stream', streamNav(true), `/${DONGLE}/stream`],
    ['a device', selectDevice('otherdongle'), '/otherdongle'],
  ])('pushes the url of %s', (_name, thunk, expected) => {
    expect(run(thunk)).toEqual([push(expected)]);
  });

  it('does not push the url it is already at', () => {
    expect(run(selectDevice(DONGLE), { router: { location: { pathname: `/${DONGLE}` } } })).toEqual([]);
  });
});
