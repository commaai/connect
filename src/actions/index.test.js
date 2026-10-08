import { vi } from 'vitest';
import { primeNav, pushTimelineRange, selectDevice, streamNav, urlForState } from './index';

vi.mock('../timeline/playback', () => ({ reducer: (state) => state, resetPlayback: vi.fn(), selectLoop: vi.fn() }));
vi.mock('connected-react-router', async () => ({ ...await vi.importActual('connected-react-router'), push: vi.fn((path) => ({ type: 'NAVIGATE', path })) }));

beforeEach(() => vi.clearAllMocks());

describe('navigation commands', () => {
  it.each([
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['zero-start drive range', ['dongle', 'log', 0, 20, false], '/dongle/log/0/20'],
    ['Prime', ['dongle', null, null, null, true], '/dongle/prime'],
  ])('generates a %s URL', (_name, args, expected) => expect(urlForState(...args)).toBe(expected));

  it('writes the exact range to history without first mutating selection', () => {
    const dispatch = vi.fn();
    pushTimelineRange('log', 1001, 20123)(dispatch, () => ({ dongleId: 'device', router: { location: { pathname: '/device' } } }));
    expect(dispatch.mock.calls).toEqual([[{ type: 'NAVIGATE', path: '/device/log/1.001/20.123' }]]);
  });

  it.each([
    ['Prime', primeNav, '/device/prime'], ['stream', streamNav, '/device/stream'],
  ])('%s opening is a navigation command only', (_name, action, path) => {
    const dispatch = vi.fn();
    action(true)(dispatch, () => ({ dongleId: 'device', router: { location: { pathname: '/device' } } }));
    expect(dispatch.mock.calls).toEqual([[{ type: 'NAVIGATE', path }]]);
  });

  it('selecting a device is a navigation command only', () => {
    const dispatch = vi.fn();
    selectDevice('next')(dispatch, () => ({ dongleId: 'device', router: { location: { pathname: '/device' } } }));
    expect(dispatch.mock.calls).toEqual([[{ type: 'NAVIGATE', path: '/next' }]]);
  });

  it('reapplying a whole-drive URL is idempotent after metadata supplied its bounds', () => {
    const dispatch = vi.fn();
    const state = { dongleId: 'device', selectedRouteId: 'log', zoom: { start: 0, end: 60000 }, routes: [{ log_id: 'log', duration: 60000 }] };
    pushTimelineRange('log', null, null, false)(dispatch, () => state);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
