import { mediaEvent, reducer, setRate, statusOf, togglePlay, videoFailed, videoLoading } from './playback';

const video = (fields) => ({ ended: false, paused: false, readyState: 4, ...fields });
const playing = { status: 'playing', rate: 1, error: null };
const failed = { status: 'error', rate: 1, error: 'Unable to play this video.' };

function afterActions(playback, ...actions) {
  return actions.reduce((state, action) => reducer(state, action), { playback }).playback;
}

describe('playback status', () => {
  it.each([
    ['loading', { readyState: 0 }],
    ['loading', { readyState: 0, paused: true }],
    ['paused', { readyState: 1, paused: true }], // also a refused autoplay
    ['buffering', { readyState: 2 }],
    ['playing', { readyState: 3 }], // native HLS can leave `waiting` with only a timeupdate
    ['ended', { ended: true, paused: true }], // the end comes with a pause
  ])('reads %s from the video', (status, fields) => {
    expect(statusOf(video(fields))).toBe(status);
  });

  it('keeps the picked rate across loads and errors', () => {
    expect(afterActions(playing, setRate(2), videoLoading())).toEqual({ status: 'loading', rate: 2, error: null });
    expect(afterActions(playing, videoFailed('Unable to play this video.'), setRate(0.5))).toEqual({ ...failed, rate: 0.5 });
  });

  it('ignores media events that change nothing or follow an error, until the video reloads', () => {
    expect(afterActions(playing, mediaEvent(video({})))).toBe(playing);
    expect(afterActions(failed, mediaEvent(video({ paused: true })), mediaEvent(video({})))).toBe(failed);
    expect(afterActions(failed, videoLoading())).toEqual({ status: 'loading', rate: 1, error: null });
  });

  it('toggles to pause while the video plays or is about to', () => {
    expect(['loading', 'playing', 'buffering', 'paused', 'ended', 'error'].map((status) => togglePlay(status).type))
      .toEqual(['ACTION_PAUSE', 'ACTION_PAUSE', 'ACTION_PAUSE', 'ACTION_PLAY', 'ACTION_PLAY', 'ACTION_PLAY']);
  });
});
