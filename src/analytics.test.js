import { analyticsMiddleware } from './analytics';
import * as Types from './actions/types';
import { pause, play } from './timeline/playback';

vi.mock('@commaai/my-comma-auth', () => ({ default: { isAuthenticated: () => false } }));

const zoom = { start: 0, end: 1000 };

function videoEvents(prevState, state, action) {
  const gtag = vi.fn();
  vi.stubGlobal('gtag', gtag);
  let current = prevState;
  analyticsMiddleware({ getState: () => current })(() => { current = state; })(action);
  vi.unstubAllGlobals();
  return gtag.mock.calls
    .filter(([type, name]) => type === 'event' && name.startsWith('video_'))
    .map(([, name, params]) => [name, params.play_speed, params.play_percentage]);
}

describe('analytics', () => {
  it('logs a play when a drive opens', () => {
    const state = { zoom, offset: 500, isPlaying: false, desiredPlaySpeed: 2 };
    expect(videoEvents({ zoom: null }, state, { type: Types.TIMELINE_PUSH_SELECTION }))
      .toEqual([['video_play', 1, 0]]);
  });

  it('logs only user pauses and plays', () => {
    const paused = { zoom, offset: 250, isPlaying: false, desiredPlaySpeed: 2 };
    expect(videoEvents(paused, paused, pause(true))).toEqual([]);
    expect(videoEvents(paused, paused, pause())).toEqual([['video_pause', 0, 0.25]]);

    const playing = { ...paused, isPlaying: true };
    expect(videoEvents(playing, playing, play(true))).toEqual([]);
    expect(videoEvents(playing, playing, play())).toEqual([['video_play', 2, 0.25]]);
  });
});
