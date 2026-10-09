import React from 'react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { reducer, seek, VideoStatus } from '../../timeline/playback';
import DriveVideo from '.';

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (fullname) => `https://video.test/${fullname}/qcamera.m3u8` } },
}));

const hlsInstances = vi.hoisted(() => []);
vi.mock('hls.js/light', () => {
  class Hls {
    static isSupported() { return true; }

    constructor(config) {
      this.config = config;
      this.handlers = {};
      this.stopLoad = vi.fn();
      this.destroy = vi.fn();
      hlsInstances.push(this);
    }

    on(event, handler) { this.handlers[event] = handler; }

    emit(event, data) { this.handlers[event](event, data); }

    loadSource() {}

    attachMedia() {}
  }
  Hls.Events = { ERROR: 'hlsError', BUFFER_CODECS: 'hlsBufferCodecs' };
  Hls.ErrorTypes = { MEDIA_ERROR: 'mediaError', NETWORK_ERROR: 'networkError' };
  Hls.ErrorDetails = { FRAG_LOAD_ERROR: 'fragLoadError' };
  return { default: Hls };
});

const ROUTE = { fullname: 'dongle|route', videoStartOffset: 2000 };
const NOT_UPLOADED = 'This video segment has not uploaded yet or has been deleted.';

let store;

// jsdom media elements never load, stand in for what the browser would report
function loadVideo(video, { currentTime = 0, duration = 60, paused = true } = {}) {
  Object.defineProperty(video, 'readyState', { value: HTMLMediaElement.HAVE_ENOUGH_DATA, configurable: true });
  Object.defineProperty(video, 'duration', { value: duration, configurable: true });
  Object.defineProperty(video, 'currentTime', { value: currentTime, writable: true, configurable: true });
  Object.defineProperty(video, 'paused', { value: paused, writable: true, configurable: true });
  fireEvent.loadedMetadata(video);
}

function timeUpdate(video, currentTime) {
  video.currentTime = currentTime;
  fireEvent.timeUpdate(video);
}

async function renderVideo() {
  store = createStore(
    reducer,
    { currentRoute: ROUTE, loop: { startTime: 12000, duration: 48000 }, offset: null, isPlaying: true, desiredPlaySpeed: 1 },
    applyMiddleware(thunk),
  );
  const { container } = render(<Provider store={store}><DriveVideo isMuted /></Provider>);
  await act(async () => {});
  return { video: container.querySelector('video'), hls: hlsInstances.at(-1) };
}

const missing = (start) => ({
  fatal: false, type: 'networkError', details: 'fragLoadError', frag: { start }, response: { code: 404 },
});

describe('DriveVideo', () => {
  beforeEach(() => {
    hlsInstances.length = 0;
  });

  it('reports where the video is, and seeks it when asked', async () => {
    const { video } = await renderVideo();
    loadVideo(video, { currentTime: 10 });
    timeUpdate(video, 15);
    expect(store.getState().offset).toBe(17000);

    act(() => store.dispatch(seek(20000)));
    expect(video.currentTime).toBe(18);
  });

  it('stops at a failed video, and reloads it from where the user seeks', async () => {
    const { hls, video } = await renderVideo();
    loadVideo(video, { currentTime: 10 });
    act(() => hls.emit('hlsError', { fatal: true, type: 'networkError', response: { code: 404 } }));
    expect(screen.getByText(NOT_UPLOADED)).toBeInTheDocument();
    expect(store.getState().videoStatus).toBe(VideoStatus.FAILED);

    act(() => store.dispatch(seek(40000)));
    await act(async () => {});
    expect(hlsInstances[1].config.startPosition).toBe(38);
  });

  it('plays up to a segment that was never uploaded, then stops there', async () => {
    const { hls, video } = await renderVideo();
    loadVideo(video, { currentTime: 10, paused: false });
    act(() => hls.emit('hlsError', missing(60)));
    expect(hls.stopLoad).toHaveBeenCalled();
    timeUpdate(video, 40);
    expect(store.getState().offset).toBe(42000);
    expect(screen.queryByText(NOT_UPLOADED)).not.toBeInTheDocument();

    act(() => timeUpdate(video, 59.9));
    expect(screen.getByText(NOT_UPLOADED)).toBeInTheDocument();
  });

  it('settles on the latest loading state when events arrive between renders', async () => {
    const { video } = await renderVideo();
    loadVideo(video, { currentTime: 10 });
    fireEvent.canPlay(video);
    act(() => {
      fireEvent.waiting(video);
      fireEvent.canPlay(video);
    });
    expect(store.getState().videoStatus).toBe(VideoStatus.READY);
  });

  it('follows the browser when it blocks autoplay, or pauses and plays from outside the page', async () => {
    const { video } = await renderVideo();
    const blocked = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
    video.play = vi.fn(() => Promise.reject(blocked));
    await act(async () => loadVideo(video));
    expect(store.getState().isPlaying).toBe(false);

    fireEvent.play(video);
    expect(store.getState().isPlaying).toBe(true);
    fireEvent.pause(video);
    expect(store.getState().isPlaying).toBe(false);
  });
});
