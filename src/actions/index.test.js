import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { navigate, pushTimelineRange } from './index';

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
    push: vi.fn(),
  };
});

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

function run(thunk, pathname = `/${DONGLE}`) {
  const state = {
    dongleId: DONGLE,
    routes: [{ log_id: LOG, duration: 60000 }],
    router: { location: { pathname } },
  };
  const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, () => state) : action));
  thunk(dispatch, () => state);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('navigation actions', () => {
  it.each([
    ['Prime', { page: 'prime' }, `/${DONGLE}/prime`],
    ['stream', { page: 'stream' }, `/${DONGLE}/stream`],
    ['settings of another device', { dongleId: 'bbbbbbbbbbbbbbbb', page: 'settings' }, '/bbbbbbbbbbbbbbbb/settings'],
    ['referrals', { page: 'referrals' }, '/referrals'],
  ])('navigates to %s', (_name, target, expected) => {
    run(navigate(target), '/');
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('does not push the page that is already open', () => {
    run(navigate({ page: 'prime' }), `/${DONGLE}/prime`);
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    ['a zoomed drive', [LOG, 10500, 20500], `/${DONGLE}/${LOG}/10/20`],
    ['a zoom from the start of the drive', [LOG, 0, 20000], `/${DONGLE}/${LOG}/0/20`],
    ['the whole drive', [LOG, 0, 60000], `/${DONGLE}/${LOG}`],
    ['a drive without a range', [LOG], `/${DONGLE}/${LOG}`],
  ])('pushes the URL of %s', (_name, args, expected) => {
    run(pushTimelineRange(...args), `/${DONGLE}`);
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('closes the drive', () => {
    run(pushTimelineRange(null), `/${DONGLE}/${LOG}/10/20`);
    expect(push).toHaveBeenCalledWith(`/${DONGLE}`);
  });
});
