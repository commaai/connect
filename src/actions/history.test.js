/* eslint-env jest */
import { history } from '../history';
import installHistorySync from '../historySync';
import * as actionsIndex from './index';
import { drives as Drives } from '@commaai/api';

jest.mock('./index', () => ({
  selectDevice: jest.fn(),
  pushTimelineRange: jest.fn(),
  primeNav: jest.fn(),
  updateSegmentRange: jest.fn(),
}));

jest.mock('@commaai/api', () => ({
  drives: {
    getRoutesSegments: jest.fn(),
  },
}));

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

  it('dispatches conversion for zoom route', async () => {
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
    expect(actionsIndex.pushTimelineRange).toHaveBeenCalledWith('00000000--000f00000d', null, null, true);
    expect(actionsIndex.updateSegmentRange).toHaveBeenCalledWith('00000000--000f00000d', 0, 1000);
  });

  it('dispatches primeNav and clears selection for prime route', () => {
    const store = makeStore({ dongleId: '0000aaaa0000aaaa', zoom: { start: 1, end: 2 }, segmentRange: undefined, primeNav: false });
    installHistorySync(store, history);
    history.push('/0000aaaa0000aaaa/prime');
    expect(actionsIndex.pushTimelineRange).toHaveBeenCalledWith(undefined, undefined, undefined, false);
    expect(actionsIndex.primeNav).toHaveBeenCalledWith(true);
  });
});
