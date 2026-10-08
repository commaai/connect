import React from 'react';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';

import DriveVideo from '.';
import store from '../../store';
import { currentOffset } from '../../timeline';
import { pause, play, resetPlayback, seek, selectLoop } from '../../timeline/playback';

// A video we can stall, and that counts what is done to it. Its time only moves in tick().
const video = vi.hoisted(() => ({
  time: 0, duration: 60, playing: false, rate: 1, pace: 1, stalled: false, seeks: 0, rateWrites: 0, handlers: {},
}));

vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: () => 'video.m3u8' } } }));
// the app's own store, with a drive already open
vi.mock('../../store', async (importOriginal) => {
  const { createAppStore } = await importOriginal();
  const { createInitialState } = await vi.importActual('../../initialState');
  const { createMemoryHistory } = await vi.importActual('history');
  const route = { fullname: 'dongle|route', log_id: 'route', duration: 60000 };
  return {
    default: createAppStore(createMemoryHistory(), { ...createInitialState('/'), currentRoute: route, zoom: { start: 0, end: 60000 } }),
  };
});
vi.mock('react-player/file', async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await vi.importActual('react');
  return {
    default: forwardRef((props, ref) => {
      const element = {
        buffered: { length: 1, start: () => 0, end: () => (video.stalled ? video.time : video.duration) },
        get readyState() { return video.stalled ? 1 : 4; },
        get paused() { return !video.playing; },
        get playbackRate() { return video.rate; },
        set playbackRate(rate) {
          if (rate !== video.rate) video.rateWrites += 1;
          video.rate = rate;
          video.playing = rate !== 0 && video.playing;
        },
        play: async () => { video.playing = true; },
        pause: () => { video.playing = false; },
      };
      const player = {
        getCurrentTime: () => video.time,
        getDuration: () => video.duration,
        getInternalPlayer: (key) => (key ? null : element),
        seekTo: (seconds) => { video.seeks += 1; video.time = seconds; },
      };
      useImperativeHandle(ref, () => player);
      useEffect(() => { props.onReady?.(player); }, []);
      useEffect(() => { video.playing = props.playing; }, [props.playing]);
      useEffect(() => {
        if (props.playbackRate !== video.rate) video.rateWrites += 1;
        video.rate = props.playbackRate;
      }, [props.playbackRate]);
      video.handlers = props;
      return null;
    }),
  };
});

// moves real time forward, and the video with it unless it is stalled
async function tick(ms) {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    if (video.playing && !video.stalled && video.rate > 0) {
      video.time = Math.min(video.duration, video.time + (0.1 * video.rate * video.pace));
    }
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      vi.advanceTimersByTime(100);
      video.handlers.onProgress?.({ playedSeconds: video.time });
    });
  }
}

async function watch() {
  await act(async () => {
    store.dispatch(resetPlayback());
    store.dispatch(selectLoop(0, 60000));
  });
  render(<Provider store={store}><DriveVideo /></Provider>);
  await act(async () => store.dispatch(play()));
  await tick(2000);
  Object.assign(video, { seeks: 0, rateWrites: 0 });
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(video, { time: 0, playing: false, rate: 1, pace: 1, stalled: false, seeks: 0, rateWrites: 0 });
});
afterEach(() => vi.useRealTimers());

describe('the video is the clock', () => {
  it('shows the time of the video while it plays', async () => {
    await watch();
    await tick(10000);
    expect(currentOffset(store.getState())).toBeCloseTo(video.time * 1000, 0);
  });

  it('leaves a playing video alone', async () => {
    await watch();
    await tick(10000);
    expect({ seeks: video.seeks, rateWrites: video.rateWrites }).toEqual({ seeks: 0, rateWrites: 0 });
  });

  it('follows a video that plays slower than real time', async () => {
    await watch();
    video.pace = 0.9; // a slow phone, a busy decoder
    await tick(10000);
    expect(currentOffset(store.getState())).toBeCloseTo(video.time * 1000, 0);
    expect({ seeks: video.seeks, rateWrites: video.rateWrites }).toEqual({ seeks: 0, rateWrites: 0 });
  });

  it('stops the clock while the video waits for data', async () => {
    await watch();
    video.stalled = true;
    await act(async () => video.handlers.onBuffer?.());
    const stalledAt = currentOffset(store.getState());
    await tick(5000);
    expect(currentOffset(store.getState())).toBe(stalledAt);
    expect(video.seeks).toBe(0);
  });

  it('seeks the video once for one seek', async () => {
    await watch();
    await act(async () => store.dispatch(seek(30000)));
    await tick(1000);
    expect(video.seeks).toBe(1);
    expect(currentOffset(store.getState())).toBeCloseTo(31000, -2);
  });

  it('seeks again to the same place', async () => {
    await watch();
    await act(async () => store.dispatch(seek(30000)));
    await tick(3000);
    await act(async () => store.dispatch(seek(30000)));
    expect(video.seeks).toBe(2);
    expect(video.time).toBe(30);
  });

  it('stays where it was paused', async () => {
    await watch();
    await act(async () => store.dispatch(pause()));
    const pausedAt = currentOffset(store.getState());
    await tick(5000);
    expect(currentOffset(store.getState())).toBe(pausedAt);
    expect(video.seeks).toBe(0);
  });

  it('plays the selected range over and over', async () => {
    await watch();
    await act(async () => store.dispatch(selectLoop(10000, 14000)));
    await act(async () => store.dispatch(seek(10000)));
    await tick(9000);
    const offset = currentOffset(store.getState());
    expect(offset).toBeGreaterThanOrEqual(10000);
    expect(offset).toBeLessThan(14200);
  });
});
