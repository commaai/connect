import { vi } from 'vitest';
import { go, push, replace } from 'connected-react-router';
import { closeDialog, openDialog, popTimelineRange, primeNav, pushTimelineRange, selectDevice, settingsNav, streamNav } from './index';

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    go: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  };
});

const state = {
  dongleId: 'dongle',
  router: { location: { pathname: '/dongle/log/10/20', search: '' } },
  routes: [{ log_id: 'log', duration: 60000 }],
  zoom: { start: 10000, end: 20000, previous: { start: 0, end: 60000 } },
};

function run(thunk, location = state.router.location) {
  const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, () => ({ ...state, router: { location } })) : action));
  dispatch(thunk);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('navigation actions', () => {
  it.each([
    ['a device', selectDevice('other'), '/other'],
    ['the root when there is no device', selectDevice(null), '/'],
    ['a whole drive', pushTimelineRange('log', null, null), '/dongle/log'],
    ['a whole drive by its bounds', pushTimelineRange('log', 0, 60000), '/dongle/log'],
    ['a drive range, to the millisecond', pushTimelineRange('log', 10400, 20065), '/dongle/log/10.4/20.065'],
    ['a drive range, rounded to the millisecond', pushTimelineRange('log', 1.4, 59999.5), '/dongle/log/0.001/60'],
    ['a range ending in whole seconds', pushTimelineRange('log', 1000, 2000), '/dongle/log/1/2'],
    ['a whole drive by bounds that round to it', pushTimelineRange('log', 0.4, 59999.6), '/dongle/log'],
    ['a drive range from the start', pushTimelineRange('log', 0, 20000), '/dongle/log/0/20'],
    ['the zoom level zoomed in from', popTimelineRange('log'), '/dongle/log'],
    ['a drive by its id', pushTimelineRange('log'), '/dongle/log'],
    ['Prime', primeNav(true), '/dongle/prime'],
    ['stream', streamNav(true), '/dongle/stream'],
  ])('pushes the URL of %s', (_name, thunk, expected) => {
    run(thunk);
    expect(push).toHaveBeenCalledWith(expected);
  });

  it.each([
    ['settings over the shown page', settingsNav('dongle'), '/dongle/log/10/20?dialog=settings'],
    ['settings over another device dashboard', settingsNav('other'), '/other?dialog=settings'],
    ['a dialog over the shown page', openDialog('uploads'), '/dongle/log/10/20?dialog=uploads'],
    ['a clip in the clips menu', openDialog('clips', 'a.mp4'), '/dongle/log/10/20?dialog=clips&clip=a.mp4'],
  ])('pushes the URL of %s, marked as opened in the app', (_name, thunk, expected) => {
    run(thunk);
    expect(push).toHaveBeenCalledWith(expected, { dialog: 1 });
  });

  it.each([
    ['zooming to the shown range', pushTimelineRange('log', 10000, 20000)],
    ['zooming to a range that rounds to the shown one', pushTimelineRange('log', 10000.4, 19999.6)],
  ])('does not push the URL already shown when %s', (_name, thunk) => {
    run(thunk);
    expect(push).not.toHaveBeenCalled();
  });

  const CLIP_URL = { pathname: '/dongle/log', search: '?dialog=clips&clip=a.mp4&ci=1', hash: '#t' };
  it.each([
    ['a clip opened in the app goes Back to the menu', closeDialog('clips'), { dialog: 2 }, () => expect(go).toHaveBeenCalledWith(-1)],
    ['the menu under a clip opened in the app goes Back to the page', closeDialog(), { dialog: 2 }, () => expect(go).toHaveBeenCalledWith(-2)],
    ['a clip opened over a linked menu goes Back to the menu', closeDialog('clips'), { dialog: 1 }, () => expect(go).toHaveBeenCalledWith(-1)],
    ['the linked menu under a clip closes in place', closeDialog(), { dialog: 1 }, () => expect(replace).toHaveBeenCalledWith('/dongle/log?ci=1#t')],
    ['a linked clip closes in place to the menu', closeDialog('clips'), undefined, () => expect(replace).toHaveBeenCalledWith('/dongle/log?ci=1&dialog=clips#t')],
  ])('closing %s', (_name, thunk, locationState, check) => {
    run(thunk, { ...CLIP_URL, state: locationState });
    check();
    expect(push).not.toHaveBeenCalled();
  });

  it('opens another clip in place of the one playing, keeping how far Back the page is', () => {
    run(openDialog('clips', 'b.mp4'), { ...CLIP_URL, state: { dialog: 2 } });
    expect(replace).toHaveBeenCalledWith('/dongle/log?ci=1&dialog=clips&clip=b.mp4#t', { dialog: 2 });
    expect(push).not.toHaveBeenCalled();
  });

  it('counts dialogs opened over one another', () => {
    run(openDialog('clips', 'a.mp4'), { pathname: '/dongle/log', search: '?dialog=clips', hash: '', state: { dialog: 1 } });
    expect(push).toHaveBeenCalledWith('/dongle/log?dialog=clips&clip=a.mp4', { dialog: 2 });
  });

  it('does not push a dialog already shown', () => {
    run(openDialog('clips', 'a.mp4'), { pathname: '/dongle/log', search: '?dialog=clips&clip=a.mp4', hash: '' });
    expect(push).not.toHaveBeenCalled();
  });
});
