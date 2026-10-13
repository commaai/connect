import * as Types from '../actions/types';
import { media } from './media';
import { reducer, resetPlayback, seek, selectLoop } from './playback';

describe('playback', () => {
  it('stores a selected range and starts a whole-route range at the first video frame', () => {
    const state = reducer({}, selectLoop(1000, 4000));
    expect(state.loop).toEqual({ startTime: 1000, duration: 3000 });
    expect(reducer(state, { type: 'other' })).toBe(state);
    expect(reducer(state, selectLoop(null, null)).loop).toBeNull();

    // the first frame is known once the route's events load
    const route = { currentRoute: {}, zoom: { start: 0, end: 60000 } };
    const looped = reducer(route, selectLoop(0, 60000));
    expect(looped.loop).toEqual({ startTime: 0, duration: 60000 });
    const events = { ...looped, currentRoute: { videoStartOffset: 5000 } };
    expect(reducer(events, { type: 'other' }).loop).toEqual({ startTime: 5000, duration: 55000 });
  });

  it('clamps a seek to the selected range and moves the media', () => {
    const element = Object.assign(new EventTarget(), { currentTime: 0, readyState: 3 });
    const unload = media.load(element, 'route', 0, () => () => {});
    const dispatch = vi.fn();
    seek(3000)(dispatch, () => ({ loop: { startTime: 1000, duration: 1000 } }));

    expect(element.currentTime).toBe(2);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_SEEK, offset: 2000 }));
    unload();
  });

  it('plays a new range from its start at normal speed', () => {
    media.pause();
    media.play(4);
    resetPlayback(8000)();
    expect(media.getSnapshot()).toMatchObject({ paused: false, playbackRate: 1, routeTime: 8000 });
  });
});
