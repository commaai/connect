import React from 'react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { reducer, seek, selectLoop, VideoStatus } from '../../timeline/playback';
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
      this.recoverMediaError = vi.fn();
      this.stopLoad = vi.fn();
      this.destroy = vi.fn();
      hlsInstances.push(this);
    }

    on(event, handler) { this.handlers[event] = handler; }

    emit(event, data) { this.handlers[event](event, data); }

    loadSource(src) { this.src = src; }

    attachMedia(media) { this.media = media; }
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

async function renderVideo({ loop = { startTime: 12000, duration: 48000 }, route = ROUTE } = {}) {
  store = createStore(
    (state, action) => (action.type === 'TEST_ROUTE' ? { ...state, currentRoute: action.route } : reducer(state, action)),
    { currentRoute: route, loop, offset: null, isPlaying: true, desiredPlaySpeed: 1 },
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

  it('streams the route from the start of the range', async () => {
    const { hls, video } = await renderVideo();
    expect(store.getState().offset).toBe(12000);
    expect(hls.src).toBe('https://video.test/dongle|route/qcamera.m3u8');
    expect(hls.media).toBe(video);
    expect(hls.config.startPosition).toBe(10);

    act(() => hls.emit('hlsBufferCodecs', { audio: {}, video: {} }));
    expect(store.getState().hasAudio).toBe(true);
  });

  it('reports where the video is, and seeks it when asked', async () => {
    const { video } = await renderVideo();
    loadVideo(video, { currentTime: 10 });
    timeUpdate(video, 15);
    expect(store.getState().offset).toBe(17000);

    act(() => store.dispatch(seek(20000)));
    expect(video.currentTime).toBe(18);
  });

  it('applies a seek made while loading', async () => {
    const { video } = await renderVideo();
    act(() => store.dispatch(seek(30000)));
    loadVideo(video, { currentTime: 10 });
    expect(video.currentTime).toBe(28);
  });

  it('keeps the position when a range around it is selected, and moves into one that is not', async () => {
    const { video } = await renderVideo({ loop: null });
    loadVideo(video);
    timeUpdate(video, 10);
    act(() => store.dispatch(selectLoop(5000, 30000)));
    expect(video.currentTime).toBe(10);
    act(() => store.dispatch(selectLoop(20000, 30000)));
    expect(video.currentTime).toBe(18);
  });

  it('loops the range, at its end and at the end of the video', async () => {
    let { video } = await renderVideo({ loop: { startTime: 5000, duration: 10000 } });
    loadVideo(video, { currentTime: 10, paused: false });
    timeUpdate(video, 13.1);
    expect(video.currentTime).toBe(3);

    ({ video } = await renderVideo());
    loadVideo(video);
    timeUpdate(video, 58);
    fireEvent.ended(video);
    expect(video.currentTime).toBe(10);
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

  it('stops at a failed video, and reloads it on a seek or a retry', async () => {
    const { hls, video } = await renderVideo();
    loadVideo(video, { currentTime: 10 });
    act(() => hls.emit('hlsError', { fatal: true, type: 'networkError', response: { code: 404 } }));
    expect(screen.getByText(NOT_UPLOADED)).toBeInTheDocument();
    expect(store.getState().videoStatus).toBe(VideoStatus.FAILED);
    timeUpdate(video, 11);
    expect(store.getState().offset).toBe(12000);

    act(() => store.dispatch(seek(40000)));
    await act(async () => {});
    expect(hlsInstances[1].config.startPosition).toBe(38);

    act(() => hlsInstances[1].emit('hlsError', { fatal: true, type: 'networkError' }));
    fireEvent.click(screen.getByText('Retry'));
    await act(async () => {});
    expect(hlsInstances).toHaveLength(3);
    expect(store.getState().videoStatus).toBe(VideoStatus.LOADING);
  });

  it('recovers from one media error, and leaves the rest to hls.js', async () => {
    const { hls } = await renderVideo();
    act(() => hls.emit('hlsError', { fatal: false, type: 'networkError' }));
    act(() => hls.emit('hlsError', { fatal: true, type: 'mediaError' }));
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();

    act(() => hls.emit('hlsError', { fatal: true, type: 'mediaError' }));
    expect(screen.getByText('Unable to load video')).toBeInTheDocument();
  });

  describe('a segment that was never uploaded', () => {
    it('fails straight away instead of waiting out retries, while loading or playing', async () => {
      let { hls, video } = await renderVideo();
      act(() => hls.emit('hlsError', missing(0)));
      expect(hls.stopLoad).toHaveBeenCalled();
      expect(screen.getByText(NOT_UPLOADED)).toBeInTheDocument();

      ({ hls, video } = await renderVideo());
      loadVideo(video, { currentTime: 10 });
      act(() => hls.emit('hlsError', missing(0)));
      expect(screen.getAllByText(NOT_UPLOADED)).toHaveLength(2);
    });

    it('plays what is buffered before it, then stops there', async () => {
      const { hls, video } = await renderVideo();
      loadVideo(video, { currentTime: 10, paused: false });
      act(() => hls.emit('hlsError', missing(60)));
      timeUpdate(video, 40);
      expect(screen.queryByText('Retry')).not.toBeInTheDocument();
      expect(store.getState().offset).toBe(42000);

      act(() => timeUpdate(video, 59.9));
      expect(screen.getByText(NOT_UPLOADED)).toBeInTheDocument();
    });

    it('reloads when the user seeks before playback gets to it', async () => {
      const { hls, video } = await renderVideo();
      loadVideo(video, { currentTime: 10 });
      act(() => hls.emit('hlsError', missing(60)));
      act(() => store.dispatch(seek(30000)));
      await act(async () => {});
      expect(hlsInstances).toHaveLength(2);
    });
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

  it('corrects the reported position when the camera start offset arrives late', async () => {
    const { video } = await renderVideo({ loop: null, route: { ...ROUTE, videoStartOffset: undefined } });
    loadVideo(video, { currentTime: 12 });
    timeUpdate(video, 12);
    expect(store.getState().offset).toBe(12000);

    act(() => store.dispatch({ type: 'TEST_ROUTE', route: ROUTE }));
    timeUpdate(video, 12);
    expect(video.currentTime).toBe(12);
    expect(store.getState().offset).toBe(14000);
  });

  it('marks a range without video as unplayable', async () => {
    const { video } = await renderVideo({ loop: { startTime: 0, duration: 1500 } });
    loadVideo(video);
    expect(screen.getByText('No video for this part of the drive')).toBeInTheDocument();
    expect(store.getState().videoStatus).toBe(VideoStatus.FAILED);
  });
});
