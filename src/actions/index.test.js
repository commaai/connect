import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { navigate, popTimelineRange, pushTimelineRange, selectDevice } from './index';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  selectLoop: vi.fn(),
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn((path) => ({ type: 'push', path })),
  };
});

const LOG = '2026-08-06--12-00-00';

function run(thunk, state) {
  const getState = () => ({
    dongleId: 'statedongle',
    routes: [{ log_id: LOG, duration: 60000 }],
    router: { location: { pathname: '/statedongle', search: '' } },
    ...state,
  });
  const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, getState) : action));
  thunk(dispatch, getState);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('navigation actions only push URLs', () => {
  it.each([
    ['Prime', navigate({ page: 'prime' }), '/statedongle/prime'],
    ['stream', navigate({ page: 'stream' }), '/statedongle/stream'],
    ['referrals', navigate({ page: 'referrals' }), '/referrals'],
    ['another device', selectDevice('otherdongle'), '/otherdongle'],
    ['a drive range', pushTimelineRange(LOG, 10500, 20900), `/statedongle/${LOG}/10/21`],
    ['a drive range from the start', pushTimelineRange(LOG, 123, 1234), `/statedongle/${LOG}/0/2`],
    ['the whole drive', pushTimelineRange(LOG, 0, 60000), `/statedongle/${LOG}`],
    ['the whole drive without a range', pushTimelineRange(LOG, null, null), `/statedongle/${LOG}`],
  ])('navigates to %s', (_name, thunk, expected) => {
    run(thunk);
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('does not push the URL that is already open', () => {
    run(navigate({ page: 'dashboard' }));
    expect(push).not.toHaveBeenCalled();
  });

  it('closes a dialog by dropping it from the query', () => {
    run(navigate({ page: 'dashboard' }), { router: { location: { pathname: '/statedongle', search: '?settings=statedongle' } } });
    expect(push).toHaveBeenCalledWith('/statedongle');
  });

  it.each([
    ['the previous range', { start: 10000, end: 20000, previous: { start: 5000, end: 30000 } }, `/statedongle/${LOG}/5/30`],
    ['the whole drive without a previous range', { start: 10000, end: 20000, previous: null }, `/statedongle/${LOG}`],
  ])('goes back to %s', (_name, zoom, expected) => {
    run(popTimelineRange(), { selectedRouteId: LOG, zoom });
    expect(push).toHaveBeenCalledWith(expected);
  });
});
