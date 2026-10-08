import React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import DriveVideo from '.';
import rootReducer from '../../reducers';
import { currentOffset, storeOffset } from '../../timeline';
import { pause, play, seek } from '../../timeline/playback';

const hls = vi.hoisted(() => ({ instances: [] }));
vi.mock('hls.js/light', () => {
  class Hls {
    static isSupported() { return true; }
    constructor() { this.handlers = {}; this.recoverMediaError = vi.fn(); this.destroy = vi.fn(); hls.instances.push(this); }
    on(event, handler) { this.handlers[event] = handler; }
    loadSource(src) { this.src = src; }
    attachMedia(video) { this.video = video; }
  }
  Hls.Events = { ERROR: 'hlsError', BUFFER_CODECS: 'hlsBufferCodecs' };
  return { default: Hls };
});
vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (fullname) => `https://video.test/${fullname}/qcamera.m3u8` } },
}));

const VIDEO_START = 2000; // first camera frame, ms into the drive
const LOOP = { startTime: VIDEO_START, duration: 58000 };

// jsdom's <video> has no playback; give it the bits of state the player reads
function fakeMedia(video) {
  const media = { currentTime: 0, readyState: 0, paused: true, seeking: false, ended: false };
  for (const key of Object.keys(media)) {
    Object.defineProperty(video, key, { configurable: true, get: () => media[key], set: (v) => { media[key] = v; } });
  }
  video.play = vi.fn(() => { media.paused = false; return Promise.resolve(); });
  video.pause = vi.fn(() => { media.paused = true; });
  return media;
}

async function renderVideo(fields = {}) {
  hls.instances = [];
  const store = createStore(rootReducer, {
    ...rootReducer(undefined, { type: '@@INIT' }),
    currentRoute: { fullname: 'dongle|log', videoStartOffset: VIDEO_START },
    desiredPlaySpeed: 1,
    offset: 0,
    startTime: Date.now(),
    isBufferingVideo: true,
    loop: LOOP,
    ...fields,
  });
  const view = render(<Provider store={store}><DriveVideo isMuted /></Provider>);
  const video = view.container.querySelector('video');
  const media = fakeMedia(video);
  await waitFor(() => expect(hls.instances).toHaveLength(1));
  return { ...view, store, video, media, hls: hls.instances[0] };
}

async function loaded(fields) {
  const app = await renderVideo(fields);
  app.media.readyState = 4;
  fireEvent.loadedMetadata(app.video);
  fireEvent.canPlay(app.video);
  return app;
}

describe('DriveVideo', () => {
  it('loads the drive stream with hls.js', async () => {
    const { hls: player, video } = await renderVideo();
    expect(player.src).toBe('https://video.test/dongle|log/qcamera.m3u8');
    expect(player.video).toBe(video);
  });

  it('starts at the store position and plays', async () => {
    const { video, media, store } = await loaded({ offset: 12000 });
    expect(media.currentTime).toBeCloseTo(10, 1);
    expect(video.play).toHaveBeenCalled();
    expect(store.getState().isBufferingVideo).toBe(false);
  });

  it('is the playback clock once loaded', async () => {
    const { media, store } = await loaded();
    media.currentTime = 7.5;
    expect(currentOffset(store.getState())).toBe(9500);
  });

  it('follows seeks from the store, and ignores rebases that land on its own time', async () => {
    const { media, store, video } = await loaded();
    act(() => { store.dispatch(seek(30000)); });
    expect(media.currentTime).toBeCloseTo(28, 1);

    media.currentTime = 28.1; // played a little; pausing rebases the store onto video time
    act(() => { store.dispatch(pause()); });
    expect(media.currentTime).toBe(28.1);
    expect(video.pause).toHaveBeenCalled();
  });

  it('plays at the requested speed', async () => {
    const { video, store } = await loaded();
    act(() => { store.dispatch(play(4)); });
    expect(video.playbackRate).toBe(4);
  });

  it('reports buffering from media events', async () => {
    const { video, store } = await loaded();
    fireEvent.waiting(video);
    expect(store.getState().isBufferingVideo).toBe(true);
    fireEvent.playing(video);
    expect(store.getState().isBufferingVideo).toBe(false);
  });

  it('reports a pause it did not ask for', async () => {
    const { video, media, store } = await loaded();
    media.paused = true;
    fireEvent.pause(video);
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('loops back at the end of the selection', async () => {
    const { video, media, store } = await loaded();
    media.currentTime = (LOOP.startTime + LOOP.duration - VIDEO_START) / 1000;
    fireEvent.timeUpdate(video);
    expect(store.getState().offset).toBe(LOOP.startTime);
    expect(media.currentTime).toBeCloseTo(0, 1);
  });

  it('shows autoplay being blocked as paused', async () => {
    const app = await renderVideo();
    app.video.play = vi.fn(() => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
    app.media.readyState = 4;
    fireEvent.loadedMetadata(app.video);
    await waitFor(() => expect(app.store.getState().desiredPlaySpeed).toBe(0));
  });

  it('leaves non-fatal hls errors to hls.js', async () => {
    const { hls: player } = await loaded();
    act(() => player.handlers.hlsError('hlsError', { fatal: false, type: 'mediaError', details: 'bufferStalledError' }));
    expect(screen.queryByText(/Unable to load video/)).not.toBeInTheDocument();
  });

  it('recovers from one fatal media error', async () => {
    const { hls: player } = await loaded();
    act(() => player.handlers.hlsError('hlsError', { fatal: true, type: 'mediaError' }));
    expect(player.recoverMediaError).toHaveBeenCalledOnce();
    expect(screen.queryByText('Unable to load video')).not.toBeInTheDocument();
    act(() => player.handlers.hlsError('hlsError', { fatal: true, type: 'mediaError' }));
    expect(screen.getByText('Unable to load video')).toBeVisible();
  });

  it('explains a missing upload', async () => {
    const { hls: player } = await loaded();
    act(() => player.handlers.hlsError('hlsError', { fatal: true, type: 'networkError', response: { code: 404 } }));
    expect(screen.getByText('This video segment has not uploaded yet or has been deleted.')).toBeVisible();
  });

  it('hands the position back to the store when it goes away', async () => {
    const { media, store, unmount, hls: player } = await loaded();
    media.currentTime = 20;
    unmount();
    expect(player.destroy).toHaveBeenCalled();
    expect(storeOffset({ ...store.getState(), desiredPlaySpeed: 0 })).toBe(22000);
  });
});
