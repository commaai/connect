import React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { act, fireEvent, render } from '@testing-library/react';

import DriveVideo from '.';
import { pause, play, reducer, seek, selectLoop } from '../../timeline/playback';

const hls = vi.hoisted(() => ({ instance: null }));
const platform = vi.hoisted(() => ({ nativeHls: false }));

vi.mock('../../utils/browser', () => ({ playsHlsNatively: () => platform.nativeHls }));

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

afterEach(() => {
  platform.nativeHls = false;
});

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

  it('shows the not uploaded message when the selected range is inside a missing segment', async () => {
    const { store, video } = await renderVideo({ loop: { startTime: 70000, duration: 10000 } });
    video.currentTime = 69;

    const frag = { start: 60, duration: 60, url: 'https://example.com/1/qcamera.ts' };
    act(() => hls.instance.handlers.error('error', { details: 'fragLoadError', response: { code: 404 }, frag }));

    expect(store.getState().desiredPlaySpeed).toEqual(0);
    expect(document.body.textContent).toContain('This video segment has not uploaded yet');
  });

  it('shows the not uploaded message and the play button for a route without video', async () => {
    const { store } = await renderVideo();

    act(() => hls.instance.handlers.error('error', { details: 'levelEmptyError', fatal: true }));

    expect(document.body.textContent).toContain('This video segment has not uploaded yet');
    expect(store.getState().desiredPlaySpeed).toEqual(0);
  });

  it('follows the OS pausing and resuming the video', async () => {
    const { store, video } = await renderVideo();

    act(() => fireEvent.pause(video)); // e.g. lock screen or headphones unplugged
    expect(store.getState().desiredPlaySpeed).toEqual(0);

    video.playbackRate = 1;
    act(() => fireEvent.play(video)); // e.g. play from the lock screen
    expect(store.getState().desiredPlaySpeed).toEqual(1);
  });

  it('stops at the end of the route, and loops a selected range', async () => {
    const { store, video } = await renderVideo();

    act(() => fireEvent.ended(video));
    expect(store.getState().desiredPlaySpeed).toEqual(0);

    // a loop over the whole route (from the start of the video) also stops
    act(() => store.dispatch(selectLoop(1000, 901000)));
    act(() => store.dispatch(play()));
    act(() => fireEvent.ended(video));
    expect(store.getState().desiredPlaySpeed).toEqual(0);

    act(() => store.dispatch(selectLoop(10000, 20000)));
    act(() => store.dispatch(play()));
    act(() => fireEvent.ended(video));
    expect(video.currentTime).toEqual(9);
    expect(store.getState().desiredPlaySpeed).toEqual(1);
  });

  describe('with native HLS (iPhone)', () => {
    async function renderNative() {
      platform.nativeHls = true;
      const onAudioStatusChange = vi.fn();
      const store = createStore(reducer, { desiredPlaySpeed: 1, offset: null, currentRoute: ROUTE });
      const { container } = render(<Provider store={store}><DriveVideo onAudioStatusChange={onAudioStatusChange} /></Provider>);
      const video = container.querySelector('video');
      Object.defineProperty(video, 'audioTracks', { value: new EventTarget(), configurable: true });
      await act(async () => {});
      return { video, onAudioStatusChange };
    }

    it('detects audio once Safari adds the audio track', async () => {
      const { video, onAudioStatusChange } = await renderNative();
      expect(video.getAttribute('src')).toEqual('https://example.com/qcamera.m3u8');

      act(() => video.audioTracks.dispatchEvent(new Event('addtrack')));
      expect(onAudioStatusChange).toHaveBeenLastCalledWith(true);
    });

    it("shows the not uploaded message when Safari can't open the playlist", async () => {
      const { video } = await renderNative();
      Object.defineProperty(video, 'error', { value: { code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED }, configurable: true });

      act(() => fireEvent.error(video));
      expect(document.body.textContent).toContain('This video segment has not uploaded yet');
    });
  });
});
