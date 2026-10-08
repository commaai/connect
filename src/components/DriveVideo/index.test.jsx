import React from 'react';
import * as Redux from 'redux';
import thunk from 'redux-thunk';
import { act, fireEvent, render, screen } from '@testing-library/react';

import DriveVideo from '.';
import { currentOffset, seekTo } from '../../timeline';
import { reducer as playbackReducer } from '../../timeline/playback';

const hls = vi.hoisted(() => ({ instances: [] }));

vi.mock('hls.js/light', () => {
  class Hls {
    static isSupported() { return true; }

    constructor() {
      this.handlers = {};
      this.destroy = vi.fn();
      this.recoverMediaError = vi.fn();
      hls.instances.push(this);
    }

    on(event, handler) { this.handlers[event] = handler; }

    emit(event, data) { act(() => this.handlers[event]?.(event, data)); }

    loadSource(src) { this.src = src; }

    attachMedia(video) { this.video = video; }
  }
  Hls.Events = { BUFFER_CODECS: 'bufferCodecs', ERROR: 'error' };
  Hls.ErrorTypes = { MEDIA_ERROR: 'mediaError', NETWORK_ERROR: 'networkError' };
  return { default: Hls };
});

const route = {
  fullname: '0000aaaa0000aaaa|2026-08-06--12-00-00',
  share_exp: '1',
  share_sig: 'sig',
  videoStartOffset: 2000,
};

function renderVideo({ zoom = { start: 10000, end: 40000 }, onAudioStatusChange = vi.fn() } = {}) {
  const store = Redux.createStore(
    playbackReducer,
    { currentRoute: route, zoom, isPaused: false, playSpeed: 1 },
    Redux.applyMiddleware(thunk),
  );
  const view = render(<DriveVideo store={store} isMuted onAudioStatusChange={onAudioStatusChange} />);
  const video = view.container.querySelector('video');
  Object.defineProperty(video, 'readyState', { configurable: true, writable: true, value: HTMLMediaElement.HAVE_NOTHING });
  video.play = vi.fn(() => Promise.resolve());
  video.pause = vi.fn();
  video.load = vi.fn(() => { video.readyState = HTMLMediaElement.HAVE_NOTHING; });
  return { ...view, store, video, onAudioStatusChange };
}

async function loadedStream() {
  await vi.waitFor(() => expect(hls.instances.length).toBeGreaterThan(0));
  return hls.instances[hls.instances.length - 1];
}

beforeEach(() => {
  hls.instances = [];
});

describe('DriveVideo', () => {
  it('streams the route through hls.js and reports its audio', async () => {
    const { video, onAudioStatusChange } = renderVideo();
    const stream = await loadedStream();
    expect(stream.src).toContain('2026-08-06--12-00-00/qcamera.m3u8');
    expect(stream.video).toBe(video);

    stream.emit('bufferCodecs', { audio: {}, video: {} });
    expect(onAudioStatusChange).toHaveBeenLastCalledWith(true);
  });

  it('starts at the selected range and plays once loaded', async () => {
    const { video } = renderVideo();
    await loadedStream();
    expect(currentOffset()).toEqual(10000);

    video.readyState = HTMLMediaElement.HAVE_METADATA;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toEqual(8); // 10s into the route, minus the 2s before the first frame
    expect(video.play).toHaveBeenCalled();
  });

  it('shows paused controls when the browser refuses to autoplay', async () => {
    const { video, store } = renderVideo();
    await loadedStream();
    video.play = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
    video.readyState = HTMLMediaElement.HAVE_METADATA;
    await act(async () => fireEvent.loadedMetadata(video));
    expect(store.getState().isPaused).toBe(true);
  });

  it('mirrors play state and speed from the element', async () => {
    const { video, store } = renderVideo();
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    video.playbackRate = 4;
    fireEvent.rateChange(video);
    expect(store.getState()).toMatchObject({ isPaused: true, playSpeed: 4 });
  });

  it('loops back to the range start', async () => {
    const { video } = renderVideo();
    await loadedStream();
    video.readyState = HTMLMediaElement.HAVE_METADATA;
    video.currentTime = 38.5; // route offset 40.5s, past the range end
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toEqual(8);
  });

  it('explains a missing video and retries from the same position', async () => {
    const { video } = renderVideo();
    const stream = await loadedStream();
    video.readyState = HTMLMediaElement.HAVE_METADATA;
    seekTo(25000);

    stream.emit('error', { fatal: true, type: 'networkError', response: { code: 404 } });
    expect(screen.getByText('This video has not uploaded yet or has been deleted.')).toBeInTheDocument();
    expect(stream.destroy).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(hls.instances).toHaveLength(2));
    expect(screen.queryByText(/has not uploaded/)).not.toBeInTheDocument();
    expect(currentOffset()).toEqual(25000);
  });

  it('recovers from one media error before giving up', async () => {
    renderVideo();
    const stream = await loadedStream();

    stream.emit('error', { fatal: false, type: 'networkError' });
    stream.emit('error', { fatal: true, type: 'mediaError' });
    expect(stream.recoverMediaError).toHaveBeenCalledOnce();
    expect(screen.queryByText('Unable to load video.')).not.toBeInTheDocument();

    stream.emit('error', { fatal: true, type: 'mediaError' });
    expect(screen.getByText('Unable to load video.')).toBeInTheDocument();
  });
});
