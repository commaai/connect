import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { createInitialState } from '../../initialState';
import { createAppStore } from '../../store';
import { resetVideo } from '../../timeline';

import DriveVideo from './index';

// hls.js is exercised by browser tests; jsdom has no Media Source Extensions.
vi.mock('hls.js', () => ({
  default: class Hls {
    static isSupported() { return false; }
    static Events = { MANIFEST_PARSED: 'hlsManifestParsed', ERROR: 'hlsError', BUFFER_CODECS: 'hlsBufferCodecs' };
    on() {}
    loadSource() {}
    attachMedia() {}
    startLoad() {}
    destroy() {}
  },
}));

const ROUTE = {
  fullname: '00000000ffffffffffffffff',
  share_exp: 'exp',
  share_sig: 'sig',
  videoStartOffset: 0,
  start_time_utc_millis: 1700000000000,
};

function setup({ route = ROUTE, state = {} } = {}) {
  const store = createAppStore({
    ...createInitialState('/'),
    currentRoute: route,
    ...state,
  });

  const utils = render(
    <Provider store={store}>
      <DriveVideo isMuted onAudioStatusChange={() => {}} />
    </Provider>,
  );
  return { store, ...utils };
}

const getVideo = () => document.querySelector('video');
const fire = (element, type, init = {}) => {
  act(() => {
    element.dispatchEvent(new Event(type, { bubbles: false, ...init }));
  });
};

describe('DriveVideo', () => {
  beforeEach(() => {
    resetVideo();
    // jsdom reports no native HLS support, so mountHls falls back to src=.
    HTMLMediaElement.prototype.canPlayType = vi.fn(() => '');
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    resetVideo();
  });

  it('renders a native video element instead of a wrapper player', () => {
    setup();
    const video = getVideo();
    expect(video).toBeTruthy();
    expect(video.src).toContain(ROUTE.fullname);
    expect(video.playsInline).toBe(true);
  });

  it('advances position only when the video reports it', () => {
    const { store } = setup();
    expect(store.getState().offset).toEqual(0);

    act(() => { getVideo().currentTime = 30; });
    fire(getVideo(), 'timeupdate');

    // 30s of video, recorded in ms from the start of the route.
    expect(store.getState().offset).toEqual(30000);
  });

  it('does not move position when only wall-clock time passes', async () => {
    const { store } = setup();
    act(() => { getVideo().currentTime = 10; });
    fire(getVideo(), 'timeupdate');

    await new Promise(resolve => setTimeout(resolve, 250));
    expect(store.getState().offset).toEqual(10000);
  });

  it('accounts for a camera that starts after the logs', () => {
    const { store } = setup({ route: { ...ROUTE, videoStartOffset: 4000 } });
    act(() => { getVideo().currentTime = 20; });
    fire(getVideo(), 'timeupdate');

    expect(store.getState().offset).toEqual(24000);
  });

  it('commands the video on a user seek', () => {
    const { store } = setup();
    act(() => { getVideo().currentTime = 5; });

    act(() => {
      store.dispatch({ type: 'ACTION_SEEK', offset: 42000 });
    });

    expect(getVideo().currentTime).toEqual(42);
    expect(store.getState().offset).toEqual(42000);
  });

  it('keeps the newest of several rapid seeks', () => {
    const { store } = setup();
    act(() => {
      store.dispatch({ type: 'ACTION_SEEK', offset: 10000 });
      store.dispatch({ type: 'ACTION_SEEK', offset: 20000 });
      store.dispatch({ type: 'ACTION_SEEK', offset: 30000 });
    });

    expect(getVideo().currentTime).toEqual(30);
  });

  it('plays and pauses the element through the requested speed', () => {
    const { store } = setup();
    const video = getVideo();

    act(() => { store.dispatch({ type: 'ACTION_PLAY', speed: 2 }); });
    expect(video.playbackRate).toEqual(2);
    expect(video.play).toHaveBeenCalled();

    act(() => { store.dispatch({ type: 'ACTION_PAUSE' }); });
    expect(video.pause).toHaveBeenCalled();
  });

  it('wraps the loop from real media time', () => {
    const { store } = setup({
      state: { loop: { startTime: 10000, duration: 10000 } },
    });
    const video = getVideo();

    act(() => { video.currentTime = 19.5; });
    fire(video, 'timeupdate');
    expect(store.getState().offset).toEqual(19500);

    act(() => { video.currentTime = 20; });
    fire(video, 'timeupdate');
    // past the loop end: back to the loop start
    expect(video.currentTime).toBeLessThan(20);
    expect(store.getState().offset).toBe(10000);
  });

  it('buffers from media events, not from a timer', () => {
    const { store } = setup();
    const video = getVideo();

    fire(video, 'waiting');
    expect(store.getState().isBufferingVideo).toBe(true);

    fire(video, 'playing');
    expect(store.getState().isBufferingVideo).toBe(false);
  });

  it('shows an error for an unsupported media source', () => {
    const { store } = setup();
    const video = getVideo();

    act(() => {
      Object.defineProperty(video, 'error', { value: { code: 4, message: '' }, configurable: true });
      video.dispatchEvent(new Event('error'));
    });

    expect(screen.getByText('Unable to load video')).toBeTruthy();
    expect(store.getState().isBufferingVideo).toBe(true);
  });

  it('swaps the source and re-registers the offset when the route changes', () => {
    const { store, rerender } = setup();
    const next = { ...ROUTE, fullname: '11111111111111111111', videoStartOffset: 7000 };

    act(() => { getVideo().currentTime = 12; });
    fire(getVideo(), 'timeupdate');
    expect(store.getState().offset).toEqual(12000);

    store.dispatch({ type: 'ACTION_ROUTE', route: next });
    rerender(
      <Provider store={store}>
        <DriveVideo isMuted onAudioStatusChange={() => {}} />
      </Provider>,
    );

    const video = getVideo();
    expect(video.src).toContain(next.fullname);
    // new camera origin is applied to media time, not to the old offset
    act(() => { video.currentTime = 20; });
    fire(video, 'timeupdate');
    expect(store.getState().offset).toEqual(27000);
  });

  it('releases the element on unmount', () => {
    const { unmount } = setup();
    unmount();
    expect(getVideo()).toBe(null);
  });
});