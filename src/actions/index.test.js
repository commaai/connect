import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { popTimelineRange, primeNav, pushTimelineRange, selectDevice, settingsNav, streamNav } from './index';

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn(),
  };
});

const state = {
  dongleId: 'dongle',
  router: { location: { pathname: '/dongle/log/10/20', search: '' } },
  routes: [{ log_id: 'log', duration: 60000 }],
  zoom: { start: 10000, end: 20000, previous: { start: 0, end: 60000 } },
};

function run(thunk) {
  const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, () => state) : action));
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
    ['a drive range, rounded out to whole seconds', pushTimelineRange('log', 10400, 20600), '/dongle/log/10/21'],
    ['a drive range from the start', pushTimelineRange('log', 0, 20000), '/dongle/log/0/20'],
    ['the zoom level zoomed in from', popTimelineRange('log'), '/dongle/log'],
    ['a drive by its id', pushTimelineRange('log'), '/dongle/log'],
    ['Prime', primeNav(true), '/dongle/prime'],
    ['stream', streamNav(true), '/dongle/stream'],
    ['settings over the shown page', settingsNav('dongle', true), '/dongle/log/10/20?settings'],
    ['settings over another device dashboard', settingsNav('other', true), '/other?settings'],
  ])('pushes the URL of %s', (_name, thunk, expected) => {
    run(thunk);
    expect(push).toHaveBeenCalledWith(expected);
  });

  it.each([
    ['zooming to the shown range', pushTimelineRange('log', 10000, 20000)],
    ['zooming to a range that rounds to the shown one', pushTimelineRange('log', 10200, 19800)],
  ])('does not push the URL already shown when %s', (_name, thunk) => {
    run(thunk);
    expect(push).not.toHaveBeenCalled();
  });
});
