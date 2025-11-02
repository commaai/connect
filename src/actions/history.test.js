/* eslint-env jest */
import { history } from '../history';
import installHistorySync from '../historySync';
import * as actionsIndex from './index';
import { drives as Drives } from '@commaai/api';
import { replace } from '../navigation';

jest.mock('./index', () => ({
  selectDevice: jest.fn(),
  pushTimelineRange: jest.fn(),
  updateSegmentRange: jest.fn(),
}));

jest.mock('@commaai/api', () => ({
  drives: {
    getRoutesSegments: jest.fn(),
  },
}));

jest.mock('../navigation', () => {
  const { history } = require('../history');
  const mock = {
    replace: jest.fn((path) => history.replace(path)),
  };
  return mock;
});

const makeStore = (initialState) => ({
  getState: jest.fn(() => initialState),
  dispatch: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('history sync', () => {
  it('dispatches selectDevice when dongle changes', () => {
    const store = makeStore({ dongleId: null, zoom: null, primeNav: false });
    installHistorySync(store, history);
    history.push('/0000aaaa0000aaaa');
    expect(store.dispatch).toHaveBeenCalled();
    expect(actionsIndex.selectDevice).toHaveBeenCalledWith('0000aaaa0000aaaa', false);
  });

  it('dispatches conversion for zoom route (canonicalize URL)', async () => {
    Drives.getRoutesSegments.mockResolvedValueOnce([
      {
        fullname: '0000aaaa0000aaaa|00000000--000f00000d',
        start_time_utc_millis: 1000,
        end_time_utc_millis: 2000,
      },
    ]);
    const store = makeStore({ dongleId: '0000aaaa0000aaaa', zoom: null, primeNav: false });
    installHistorySync(store, history);
    history.push('/0000aaaa0000aaaa/1230/1234');
    // Allow async conversion to resolve
    await new Promise((r) => setTimeout(r, 0));
    expect(replace).toHaveBeenCalledWith('/0000aaaa0000aaaa/00000000--000f00000d/1230/1234');
    // After replace, pathSegmentRange processing should dispatch updates
    await new Promise((r) => setTimeout(r, 0));
    expect(actionsIndex.pushTimelineRange).toHaveBeenCalledWith('00000000--000f00000d', 1230000, 1234000, false);
  });

  it('handles prime route via URL (no dispatch)', () => {
    history.replace('/');
    const store = makeStore({ dongleId: '0000aaaa0000aaaa', zoom: { start: 1, end: 2 }, segmentRange: undefined });
    installHistorySync(store, history);
    store.dispatch.mockClear();
    history.push('/0000aaaa0000aaaa/prime');
    // no store dispatch needed for prime; components derive from URL
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});
