import { analyticsMiddleware } from './analytics';
import { reducer } from './timeline/playback';
import { bindMediaElement, resetMediaSessionForTests } from './timeline/media';
import * as Types from './actions/types';

vi.mock('@commaai/my-comma-auth', () => ({ default: { isAuthenticated: () => false } }));
vi.mock('./utils', () => ({ deviceIsOnline: () => false }));
let state;
let send;
beforeEach(() => {
  resetMediaSessionForTests();
  vi.stubGlobal('gtag', vi.fn());
  state = { currentRoute: { fullname: 'a|one', duration: 10000 },
    zoom: { start: 0, end: 10000 }, offset: 0, playSpeed: 1, isPaused: true };
  bindMediaElement({ currentTime: 5, readyState: 2 }, { routeFullname: 'a|one' });
  send = analyticsMiddleware({ getState: () => state })((action) => { state = reducer(state, action); });
});
afterEach(() => { resetMediaSessionForTests(); vi.unstubAllGlobals(); });

it('records the requested seek target before the synchronous native command runs', () => {
  send({ type: Types.ACTION_SEEK, offset: 8000 });
  expect(gtag).toHaveBeenCalledWith('event', 'video_seek', expect.objectContaining({ play_percentage: 0.8 }));
});

it('records play/pause intent rates without waiting for later native observations', () => {
  send({ type: Types.ACTION_PLAY, speed: 0.5, offset: 5000 });
  expect(gtag).toHaveBeenLastCalledWith('event', 'video_play', expect.objectContaining({
    play_speed: 0.5, play_percentage: 0.5,
  }));
  send({ type: Types.ACTION_PLAYBACK_MIRROR, fullname: 'a|one', snapshot: { isPaused: false } });
  send({ type: Types.ACTION_PAUSE, offset: 5000 });
  expect(gtag).toHaveBeenLastCalledWith('event', 'video_pause', expect.objectContaining({ play_speed: 0 }));
  expect(gtag).toHaveBeenCalledTimes(2);
});
