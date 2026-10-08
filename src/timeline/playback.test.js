import { vi } from 'vitest';

import * as Types from '../actions/types';
import * as player from './player';
import { pause, play, reducer, seek, selectLoop, setPlaySpeed, updateVideoState } from './playback';

vi.mock('./player', () => ({
  getOffset: vi.fn(() => 1234),
  pause: vi.fn(),
  play: vi.fn(),
  seek: vi.fn(),
  setLoop: vi.fn(),
  setPlaySpeed: vi.fn(),
}));

describe('playback', () => {
  it('stores the selected section', () => {
    let state = reducer({}, { type: Types.ACTION_LOOP, start: 1000, end: 5000 });
    expect(state.loop).toEqual({ startTime: 1000, duration: 4000 });

    state = reducer(state, { type: Types.ACTION_LOOP, start: null, end: null });
    expect(state.loop).toEqual(null);
  });

  it('stores the state reported by the video', () => {
    const state = reducer({ isPaused: true, playSpeed: 1, isBufferingVideo: true },
      updateVideoState({ isPaused: false, playSpeed: 2, isBufferingVideo: false }));
    expect(state).toEqual({ isPaused: false, playSpeed: 2, isBufferingVideo: false });
  });

  it('controls the video and records what was done', () => {
    const dispatch = vi.fn();
    const testCases = [
      { action: seek(5000), call: [player.seek, 5000], records: [{ type: Types.ACTION_SEEK, offset: 1234 }] },
      { action: play(), call: [player.play], records: [{ type: Types.ACTION_PLAY }] },
      { action: pause(), call: [player.pause], records: [{ type: Types.ACTION_PAUSE }] },
      { action: selectLoop(0, 60000), call: [player.setLoop, 0, 60000], records: [{ type: Types.ACTION_LOOP, start: 0, end: 60000 }] },
      { action: setPlaySpeed(2), call: [player.setPlaySpeed, 2], records: [] },
    ];
    testCases.forEach(({ action, call: [fn, ...args], records }) => {
      dispatch.mockClear();
      action(dispatch);
      expect(fn).toHaveBeenCalledWith(...args);
      expect(dispatch.mock.calls.map(([record]) => record)).toEqual(records);
    });
  });
});
