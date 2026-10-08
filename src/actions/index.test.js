import { vi } from 'vitest';
import { goBack, push, replace } from 'connected-react-router';

import {
  closeDialog, openDialog, popTimelineRange, primeNav, pushTimelineRange,
  selectDevice, selectTimeFilter, streamNav, urlForState,
} from './index';
import { parseLocation } from '../url';

vi.mock('connected-react-router', async () => {
  const actual = await vi.importActual('connected-react-router');
  return {
    ...actual,
    goBack: vi.fn(() => ({ type: 'GO_BACK' })),
    push: vi.fn((url, state) => ({ type: 'PUSH', payload: { args: [url, state] } })),
    replace: vi.fn((url, state) => ({ type: 'REPLACE', payload: { args: [url, state] } })),
  };
});

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

function makeState(url = `/${DONGLE}`) {
  const location = new URL(url, 'http://connect.local');
  const routerLocation = {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    state: null,
  };
  return {
    dongleId: DONGLE,
    navigation: parseLocation(routerLocation),
    router: { location: routerLocation },
    routes: [{ log_id: LOG, duration: 60_000 }],
    routeDetails: {},
    filter: { start: 1, end: 2 },
    limit: 5,
  };
}

function run(action, state = makeState()) {
  const dispatched = [];
  const dispatch = (nextAction) => {
    if (typeof nextAction === 'function') return nextAction(dispatch, () => state);
    dispatched.push(nextAction);
    return nextAction;
  };
  action(dispatch, () => state);
  return dispatched;
}

describe('URL navigation actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['device', [DONGLE, null, null, null, false], `/${DONGLE}`],
    ['whole drive', [DONGLE, LOG, null, null, false], `/${DONGLE}/${LOG}`],
    ['drive range', [DONGLE, LOG, 10, 20, false], `/${DONGLE}/${LOG}/10/20`],
    ['zero-start drive range', [DONGLE, LOG, 0, 20, false], `/${DONGLE}/${LOG}/0/20`],
    ['Prime', [DONGLE, null, null, null, true], `/${DONGLE}/prime`],
  ])('generates a %s URL', (_name, args, expected) => {
    expect(urlForState(...args)).toBe(expected);
  });

  it('navigates to a zero-start timeline range and preserves it in the URL', () => {
    run(pushTimelineRange(LOG, 0, 20_000));
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}/0/20`, undefined);
  });

  it('uses the whole-drive URL when the complete range is selected', () => {
    run(pushTimelineRange(LOG, 0, 60_000));
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}`, undefined);
  });

  it('returns from a range to the whole drive', () => {
    const state = makeState(`/${DONGLE}/${LOG}/10/20`);
    run(popTimelineRange(LOG), state);
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${LOG}`, undefined);
  });

  it.each([
    ['Prime', primeNav, true, `/${DONGLE}/prime`],
    ['stream', streamNav, true, `/${DONGLE}/stream`],
    ['device selection', () => selectDevice(OTHER), false, `/${OTHER}`],
  ])('navigates to %s', (_name, action, enabled, expected) => {
    if (enabled) run(action(true));
    else run(action());
    expect(push).toHaveBeenCalledWith(expected, undefined);
  });

  it('opens and closes a URL-backed dialog while retaining the page', () => {
    run(openDialog('settings'));
    expect(push).toHaveBeenCalledWith(`/${DONGLE}?dialog=settings`, {
      navigationParent: `/${DONGLE}`,
    });

    const nested = makeState(`/${DONGLE}?dialog=settings-unpair`);
    nested.router.location.state = { navigationParent: `/${DONGLE}?dialog=settings` };
    run(closeDialog(), nested);
    expect(goBack).toHaveBeenCalledOnce();
  });

  it('replaces a deep-linked dialog URL when closing without a parent history entry', () => {
    run(closeDialog(), makeState(`/${DONGLE}?dialog=settings`));
    expect(replace).toHaveBeenCalledWith(`/${DONGLE}`, undefined);
  });

  it('commits a filter change and closes the filter dialog', () => {
    const state = makeState(`/${DONGLE}?dialog=filter`);
    run(selectTimeFilter(10, 20), state);
    expect(replace).toHaveBeenCalledWith(`/${DONGLE}?filterStart=10&filterEnd=20`, undefined);
  });
});
