import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { closeDialog, closePage, openDialog, openPage, pushTimelineRange } from './index';
import { DIALOGS, PAGES } from '../url';

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

// Runs a thunk and any thunks it dispatches against a fixed state.
function run(thunk, state) {
  const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, () => state) : action));
  thunk(dispatch, () => state);
}

const router = (url) => ({ location: { pathname: url.split('?')[0], search: url.includes('?') ? `?${url.split('?')[1]}` : '' } });

describe('navigation actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pushes the drive URL when editing zoom', () => {
    run(pushTimelineRange('log', 1234, 5678), { dongleId: 'dongle', router: router('/dongle/log'), zoom: {} });
    expect(push).toHaveBeenCalledWith('/dongle/log/1/5');
  });

  it.each([
    ['Prime', openPage(PAGES.PRIME), '/dongle', '/dongle/prime'],
    ['stream', openPage(PAGES.STREAM), '/dongle', '/dongle/stream'],
    ['referrals', openPage(PAGES.REFERRALS), '/dongle', '/referrals'],
    ['the dashboard', closePage(), '/dongle/prime', '/dongle'],
    ['settings over a drive', openDialog(DIALOGS.SETTINGS), '/dongle/log', '/dongle/log?dialog=settings'],
    ['settings for another device', openDialog(DIALOGS.SETTINGS, 'other'), '/dongle/log', '/other?dialog=settings'],
    ['the page under a dialog', closeDialog(), '/dongle/log?dialog=settings', '/dongle/log'],
  ])('navigates to %s', (_name, thunk, from, expected) => {
    run(thunk, { dongleId: 'dongle', router: router(from) });
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('stays put when already on the page', () => {
    run(openPage(PAGES.PRIME), { dongleId: 'dongle', router: router('/dongle/prime') });
    expect(push).not.toHaveBeenCalled();
  });
});
