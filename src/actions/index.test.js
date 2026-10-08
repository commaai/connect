import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, streamNav, urlForState } from './index';
import route from '../test-data/public-route.json';

vi.mock('../timeline/playback', () => ({ reducer: (state) => state, resetPlayback: vi.fn(), selectLoop: vi.fn() }));

vi.mock('connected-react-router', async () => ({ ...await vi.importActual('connected-react-router'), push: vi.fn() }));
const DONGLE = route.dongle_id;
const LOG = route.fullname.split('|')[1];

beforeEach(() => vi.clearAllMocks());

describe('navigation commands', () => {
  it.each([
    [null, null, null, false, `/${DONGLE}`],
    [LOG, null, null, false, `/${DONGLE}/${LOG}`],
    [LOG, 0, 20.002, false, `/${DONGLE}/${LOG}/0/20.002`],
    [null, null, null, true, `/${DONGLE}/prime`],
  ])('formats compatible direct URLs', (log, start, end, prime, expected) => {
    expect(urlForState(DONGLE, log, start, end, prime)).toBe(expected);
  });

  it('timeline control issues only a navigation command; history applies the selection', () => {
    const dispatch = vi.fn();
    pushTimelineRange(LOG, 1001, 20002)(dispatch, () => ({ dongleId: DONGLE }));
    expect(push).toHaveBeenCalledWith({ pathname: `/${DONGLE}/${LOG}/1.001/20.002`, state: { previousZoom: null } });
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it.each([['prime', primeNav], ['stream', streamNav]])('%s control issues only a navigation command', (page, action) => {
    const dispatch = vi.fn();
    action(true)(dispatch, () => ({ dongleId: DONGLE }));
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/${page}`);
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
