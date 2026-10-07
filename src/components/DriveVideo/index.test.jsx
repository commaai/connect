import React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { act, fireEvent, render } from '@testing-library/react';

import DriveVideo from '.';
import { pause, play, reducer, seek, selectLoop } from '../../timeline/playback';

const hls = vi.hoisted(() => ({ instance: null }));

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: () => 'https://example.com/qcamera.m3u8' } },
}));

vi.mock('hls.js/light', () => ({
  default: class FakeHls {
    static Events = { BUFFER_CODECS: 'bufferCodecs', ERROR: 'error' };

    static ErrorDetails = { FRAG_LOAD_ERROR: 'fragLoadError', LEVEL_EMPTY_ERROR: 'levelEmptyError' };

    constructor() {
      this.handlers = {};
      this.startLoad = vi.fn();
      this.stopLoad = vi.fn();
      this.destroy = vi.fn();
      hls.instance = this;
    }

    on(event, handler) {
      this.handlers[event] = handler;
    }

    loadSource() {}

    attachMedia() {}
  },
}));

const ROUTE = { fullname: 'deadbeefdeadbeef|00000000--0000000001', videoStartOffset: 1000 };

// jsdom has no media playback, so give the <video> just enough to act like a loaded one
function fakeLoadedVideo(video) {
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  Object.defineProperty(video, 'duration', { value: 900, configurable: true });
  Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });
  video.play = vi.fn(() => Promise.resolve());
  video.pause = vi.fn();
}

async function renderVideo(state = {}) {
  const store = createStore(reducer, {
    desiredPlaySpeed: 1,
    isBufferingVideo: true,
    offset: null,
    startTime: 0,
    loop: null,
    currentRoute: ROUTE,
    ...state,
  });
  const { container } = render(<Provider store={store}><DriveVideo /></Provider>);
  const video = container.querySelector('video');
  await act(async () => {}); // let the stream (and fake hls.js) load
  fakeLoadedVideo(video);
  fireEvent.loadedMetadata(video);
  return { store, video };
}

describe('DriveVideo', () => {
  it('starts playing at the requested offset once the video loads', async () => {
    const { video } = await renderVideo({ offset: 30000 });

    // route offset 30s is video time 29s, since the video starts 1s into the route
    expect(video.currentTime).toEqual(29);
    expect(video.play).toHaveBeenCalled();
  });

  it('applies seek, pause and speed requests to the video', async () => {
    const { store, video } = await renderVideo();

    act(() => store.dispatch(seek(60000)));
    expect(video.currentTime).toEqual(59);

    act(() => store.dispatch(pause()));
    expect(video.pause).toHaveBeenCalled();

    act(() => store.dispatch(play(2)));
    expect(video.playbackRate).toEqual(2);
  });

  it('shows the play button when autoplay is blocked', async () => {
    const store = createStore(reducer, { desiredPlaySpeed: 1, offset: null, currentRoute: ROUTE });
    const { container } = render(<Provider store={store}><DriveVideo /></Provider>);
    const video = container.querySelector('video');
    await act(async () => {});
    fakeLoadedVideo(video);
    video.play = vi.fn(() => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));

    await act(async () => fireEvent.loadedMetadata(video));

    expect(store.getState().desiredPlaySpeed).toEqual(0);
    expect(store.getState().isBufferingVideo).toEqual(false);
  });

  it('wraps back to the loop start when playback passes the loop end', async () => {
    const { store, video } = await renderVideo();
    act(() => store.dispatch(selectLoop(10000, 20000)));

    video.currentTime = 19.5; // route offset 20.5s, past the loop end
    fireEvent.timeUpdate(video);

    expect(video.currentTime).toEqual(9);
  });

  it('skips over a segment that was never uploaded', async () => {
    const { video } = await renderVideo();
    video.currentTime = 59.8;

    const frag = { start: 60, duration: 60, url: 'https://example.com/1/qcamera.ts' };
    act(() => hls.instance.handlers.error('error', { details: 'fragLoadError', response: { code: 404 }, frag }));

    expect(frag.gap).toEqual(true);
    expect(video.currentTime).toBeCloseTo(120.1);
    expect(hls.instance.startLoad).toHaveBeenCalledWith(video.currentTime);
    expect(document.body.textContent).toContain("Segment 1 wasn't uploaded, skipped ahead");
  });
});
