import React from 'react';
import * as Redux from 'redux';
import thunk from 'redux-thunk';
import { Provider } from 'react-redux';
import { act, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import DriveVideo from '.';
import { reducer } from '../../timeline/playback';
import { playerOffset } from '../../timeline/player';

const mocks = vi.hoisted(() => ({ store: null }));

vi.mock('../../timeline', async () => {
  const actual = await vi.importActual('../../timeline');
  return { currentOffset: (state) => actual.currentOffset(state || mocks.store.getState()) };
});
vi.mock('../../utils/browser', () => ({ hasNativeHls: () => true }));
vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (fullname) => `https://api.example.com/${fullname}/qcamera.m3u8` } },
}));

const PLAYLIST = '#EXTM3U\n#EXTINF:60,0\n0.ts\n#EXTINF:60,1\n1.ts\n#EXTINF:30,2\n2.ts\n#EXT-X-ENDLIST';
const route = { fullname: 'dongle|log', videoStartOffset: 1000, duration: 151000 };

// jsdom has no media engine, so the test plays the part of the browser
function mediaState(video, state) {
  for (const [key, value] of Object.entries(state)) {
    Object.defineProperty(video, key, { configurable: true, value });
  }
}

async function renderVideo({ playlist = PLAYLIST, status = 200, ...state } = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(playlist, { status })));
  mocks.store = Redux.createStore(reducer, {
    currentRoute: route, desiredPlaySpeed: 1, offset: 31000, startTime: Date.now(), isBufferingVideo: true,
    loop: { startTime: 0, duration: 151000 }, ...state,
  }, Redux.applyMiddleware(thunk));
  const view = render(<Provider store={mocks.store}><DriveVideo isMuted /></Provider>);
  const video = view.container.querySelector('video');
  mediaState(video, { paused: true, ended: false, seeking: false, readyState: 0 });
  video.play = vi.fn(async () => mediaState(video, { paused: false }));
  video.pause = vi.fn(() => mediaState(video, { paused: true }));
  video.load = vi.fn();
  if (status === 200) {
    await waitFor(() => video.getAttribute('src') || Promise.reject(new Error('not loaded')));
  }
  return { ...view, video, store: mocks.store };
}

function fire(video, type, state = {}) {
  mediaState(video, state);
  act(() => { video.dispatchEvent(new Event(type)); });
}

describe('DriveVideo', () => {
  beforeAll(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterAll(() => vi.unstubAllGlobals());

  it('starts playing from the timeline once loaded', async () => {
    const { video } = await renderVideo();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    fire(video, 'loadedmetadata', { readyState: 1 });
    expect(video.currentTime).toBe(30);
    expect(video.play).toHaveBeenCalled();
    expect(playerOffset()).toBe(31000);
  });

  it('stays paused when the timeline is paused', async () => {
    const { video } = await renderVideo({ desiredPlaySpeed: 0 });
    fire(video, 'loadedmetadata', { readyState: 1 });
    expect(video.play).not.toHaveBeenCalled();
  });

  it('records pausing and playing by the browser', async () => {
    const { video, store } = await renderVideo();
    fire(video, 'loadedmetadata', { readyState: 4 });
    fire(video, 'pause', { paused: true });
    expect(store.getState().desiredPlaySpeed).toBe(0);
    fire(video, 'play', { paused: false, playbackRate: 2 });
    expect(store.getState().desiredPlaySpeed).toBe(2);
  });

  it('shows buffering while it waits for data to play', async () => {
    const { video, store } = await renderVideo();
    fire(video, 'loadedmetadata', { readyState: 1 });
    fire(video, 'waiting', { paused: false, readyState: 2 });
    expect(store.getState().isBufferingVideo).toBe(true);
    fire(video, 'playing', { readyState: 4 });
    expect(store.getState().isBufferingVideo).toBe(false);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('starts the loop again when the video ends', async () => {
    const { video } = await renderVideo({ loop: { startTime: 61000, duration: 30000 } });
    fire(video, 'loadedmetadata', { readyState: 4 });
    video.play.mockClear();
    fire(video, 'pause', { paused: true, ended: true });
    fire(video, 'ended');
    expect(video.currentTime).toBe(60);
    expect(video.play).toHaveBeenCalled();
  });

  it('maps time around missing segments', async () => {
    const { video } = await renderVideo({ playlist: '#EXTM3U\n#EXTINF:60,0\n0.ts\n#EXTINF:60,2\n2.ts', offset: 91000 });
    fire(video, 'loadedmetadata', { readyState: 4 });
    expect(video.currentTime).toBe(60); // the start of segment 2, segment 1 is missing
    expect(playerOffset()).toBe(121000);
  });

  it.each([
    [404, 'This video has not uploaded yet or has been deleted.'],
    [500, 'Unable to load video'],
  ])('lets the timeline play on when the playlist fails with %i', async (status, message) => {
    const { store } = await renderVideo({ status });
    expect(await screen.findByText(message)).toBeVisible();
    expect(store.getState().isBufferingVideo).toBe(false);
    expect(playerOffset()).toBeNull();
  });

  it('hands the clock back to the timeline when it unmounts', async () => {
    const { video, unmount, store } = await renderVideo();
    fire(video, 'loadedmetadata', { readyState: 4 });
    video.currentTime = 50;
    unmount();
    expect(playerOffset()).toBeNull();
    expect(store.getState().offset).toBe(51000);
  });
});
