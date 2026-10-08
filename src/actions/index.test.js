import { vi } from 'vitest';
import { push, replace } from 'connected-react-router';
import { primeNav, pushTimelineRange, streamNav, urlForState, navigateModal, navigatePage, selectDevice, checkRoutesData } from './index';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { api } from '../api/backend';
import * as Types from './types';

vi.mock('../timeline/playback', () => ({ reducer: (state) => state, resetPlayback: vi.fn(() => ({ type: 'RESET' })), selectLoop: vi.fn((start, end) => ({ type: 'LOOP', start, end })) }));
vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() }, auth: { isAuthenticated: () => true } } }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('connected-react-router', async () => ({ ...(await vi.importActual('connected-react-router')), push: vi.fn((url) => ({ type: 'PUSH', url })), replace: vi.fn((url) => ({ type: 'REPLACE', url })) }));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const OTHER_LOG = '2026-08-06--13-00-00';
function create(initial = {}) {
  let state = { dongleId: DONGLE, filter: { start: 1, end: 100 }, limit: 5, ...initial };
  const dispatch = vi.fn((action) => typeof action === 'function' ? action(dispatch, () => state) : action);
  return { dispatch, run: (action) => action(dispatch, () => state), setState: (patch) => { state = { ...state, ...patch }; } };
}

beforeEach(() => vi.clearAllMocks());

describe('navigation actions', () => {
  it.each([
    ['device', [DONGLE, null, null, null, false], `/${DONGLE}`],
    ['whole drive', [DONGLE, LOG, null, null, false], `/${DONGLE}/${LOG}`],
    ['range', [DONGLE, LOG, 10, 20, false], `/${DONGLE}/${LOG}/10/20`],
    ['zero-start range', [DONGLE, LOG, 0, 20, false], `/${DONGLE}/${LOG}/0/20`],
    ['Prime', [DONGLE, null, null, null, true], `/${DONGLE}/prime`],
  ])('generates a %s URL', (_name, args, expected) => expect(urlForState(...args)).toBe(expected));

  it('preserves demo context, unrelated search and hash when opening a page', () => {
    const { run } = create({ router: { location: { pathname: `/demo/${DONGLE}/${LOG}`, search: '?utm_source=test&modal=info', hash: '#keep' } } });
    run(navigatePage('referrals'));
    expect(push).toHaveBeenCalledWith('/demo/referrals?utm_source=test#keep');
  });

  it('changes only overlay parameters and supports replace after an operation', () => {
    const { run } = create({ router: { location: { pathname: `/${DONGLE}/${LOG}`, search: '?utm_source=test', hash: '#keep' } } });
    run(navigateModal('settings', { device: DONGLE }));
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}?utm_source=test&modal=settings&device=${DONGLE}#keep`);
    run(navigateModal('clips', {}, true));
    expect(replace).toHaveBeenCalledWith(`/${DONGLE}/${LOG}?utm_source=test&modal=clips#keep`);
    expect(resetPlayback).not.toHaveBeenCalled();
  });

  it.each([['Prime', primeNav, 'prime'], ['stream', streamNav, 'stream']])('opens %s through the central URL path', (_name, action, suffix) => {
    const { run, dispatch } = create({ router: { location: { pathname: `/${DONGLE}`, search: '' } } });
    run(action(true));
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${suffix}`);
    expect(dispatch.mock.calls.some(([value]) => value?.type === Types.ACTION_PRIME_NAV || value?.type === Types.ACTION_STREAM_NAV)).toBe(false);
  });

  it('does not reset a selected device when opening its dashboard URL', () => {
    const { run, dispatch } = create({ router: { location: { pathname: `/${DONGLE}/${LOG}`, search: '?utm_source=test' } } });
    run(selectDevice(DONGLE));
    expect(push).toHaveBeenCalledWith(`/${DONGLE}?utm_source=test`);
    expect(dispatch.mock.calls.some(([value]) => value?.type === Types.ACTION_SELECT_DEVICE)).toBe(false);
  });

  it('does not reset matching drive playback when selecting identical bounds', () => {
    const { run } = create({ selectedRouteId: LOG, zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 }, routes: [{ log_id: LOG, duration: 60000 }], router: { location: { pathname: `/${DONGLE}/${LOG}` } } });
    run(pushTimelineRange(LOG, 0, 60000, false));
    expect(resetPlayback).not.toHaveBeenCalled();
    expect(selectLoop).not.toHaveBeenCalled();
  });

  it('retains a fractional zero-start range in the URL', () => {
    const { run } = create({ selectedRouteId: LOG, zoom: null, routes: [{ log_id: LOG, duration: 60000 }], router: { location: { pathname: `/${DONGLE}/${LOG}`, search: '?utm_source=test' } } });
    run(pushTimelineRange(LOG, 0, 12345));
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}/0/12.345?utm_source=test`);
    expect(selectLoop).toHaveBeenCalledWith(0, 12345);
  });

  it('ignores old metadata when the selected route changes on the same device', async () => {
    let finishOld;
    api.routes.getRoutesSegments.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce([]);
    const { run, setState, dispatch } = create({ selectedRouteId: LOG, routes: null });
    const old = run(checkRoutesData());
    setState({ selectedRouteId: OTHER_LOG });
    const newer = run(checkRoutesData());
    await newer;
    finishOld([{ fullname: `${DONGLE}|${LOG}`, url: 'https://example.com', start_time_utc_millis: 1000, end_time_utc_millis: 61000, segment_start_times: [1000], segment_end_times: [61000], segment_numbers: [0] }]);
    await old;
    const metadata = dispatch.mock.calls.map(([action]) => action).filter((action) => action.type === Types.ACTION_ROUTES_METADATA);
    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({ routeId: OTHER_LOG, routes: [] });
  });

  it('accepts only the newest request when navigation returns A to B to A', async () => {
    const finish = [];
    api.routes.getRoutesSegments.mockImplementation(() => new Promise((resolve) => { finish.push(resolve); }));
    const { run, setState, dispatch } = create({ selectedRouteId: LOG, routes: null });
    const first = run(checkRoutesData());
    setState({ selectedRouteId: OTHER_LOG });
    const middle = run(checkRoutesData());
    setState({ selectedRouteId: LOG });
    const last = run(checkRoutesData());
    finish[2]([]);
    await last;
    finish[0]([]);
    finish[1]([]);
    await Promise.all([first, middle]);
    const metadata = dispatch.mock.calls.map(([action]) => action).filter((action) => action.type === Types.ACTION_ROUTES_METADATA);
    expect(metadata).toHaveLength(1);
    expect(metadata[0].routeId).toBe(LOG);
  });
});
