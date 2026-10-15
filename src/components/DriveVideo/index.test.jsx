import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';

import DriveVideo from '.';
import { currentOffset, getVideo, videoTime } from '../../timeline';
import { play, reducer, seek } from '../../timeline/playback';

const mocks = vi.hoisted(() => ({ hls: null, store: null }));

function setVideoState(video, state) {
  Object.entries(state).forEach(([key, value]) => {
    Object.defineProperty(video, key, { configurable: true, value });
  });
}

vi.mock('hls.js/light', () => ({
  default: class Hls {
    static Events = {
      BUFFER_CODECS: 'hlsBufferCodecs', ERROR: 'hlsError', FRAG_BUFFERED: 'hlsFragBuffered', FRAG_LOADED: 'hlsFragLoaded',
      FRAG_LOADING: 'hlsFragLoading', MANIFEST_PARSED: 'hlsManifestParsed',
    };

    static DefaultConfig = { fragLoadPolicy: { default: { errorRetry: {} } } };

    static isSupported() {
      return true;
    }

    constructor(config) {
      Object.assign(this, { config, handlers: {}, levels: [], startPosition: -1 });
      this.destroy = vi.fn();
      this.attachMedia = vi.fn((media) => { this.media = media; });
      this.startLoad = vi.fn((position) => { this.startPosition = position; });
      // like hls.js, these reattach a video that has data, which resets and pauses it
      this.recoverMediaError = vi.fn(() => this.resetMedia());
      this.loadSource = vi.fn(() => {
        if (this.media && this.levels.length) {
          this.resetMedia();
        }
        Object.assign(this, { levels: [], latestLevelDetails: null });
      });
      mocks.hls = this;
    }

    on(event, handler) {
      this.handlers[event] = handler;
    }

    resetMedia() {
      setVideoState(this.media, { paused: true, readyState: 0, error: null });
      this.media.currentTime = 0;
    }
  },
}));

vi.mock('../../store', () => ({ default: { getState: () => mocks.store.getState() } }));

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (name) => `https://example.com/${name}/qcamera.m3u8`, getHlsConfig: () => ({}) } },
}));

const MISSING_SEGMENT = 'This video segment has not uploaded yet or has been deleted.';

// the video starts 2 s into the drive, so 10 s into the drive is 8 s into the video
const route = { fullname: 'route', duration: 60000, videoStartOffset: 2000 };

const advance = (ms = 16) => act(() => vi.advanceTimersByTime(ms));

function hlsEvent(event, data = {}) {
  act(() => {
    if (event === 'hlsManifestParsed') {
      Object.assign(mocks.hls, { levels: [{}], latestLevelDetails: { fragments: [], fragmentEnd: 60 } });
    }
    mocks.hls.handlers[event](event, data);
  });
}

const missingSegment = (start, end, fatal = false) => hlsEvent('hlsError', {
  details: 'fragLoadError', fatal, frag: { start, end }, response: { code: 404 },
});

async function mount(state = {}) {
  const store = createStore(
    (s, action) => (action.type === 'TEST_ROUTE' ? { ...s, currentRoute: action.route } : reducer(s, action)),
    { currentRoute: route, desiredPlaySpeed: 1, isPlaying: false, offset: null, zoom: { start: 10000, end: 50000 }, ...state },
    applyMiddleware(thunk),
  );
  mocks.store = store;
  const onAudioStatusChange = vi.fn();
  const view = render(<Provider store={store}><DriveVideo isMuted onAudioStatusChange={onAudioStatusChange} /></Provider>);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); // hls.js is imported asynchronously
  return { ...view, store, onAudioStatusChange, video: view.container.querySelector('video') };
}

// a video that loaded where hls.js was asked to start, and is playing
async function mountPlaying(state) {
  const view = await mount(state);
  hlsEvent('hlsManifestParsed');
  view.video.currentTime = mocks.hls.startPosition;
  setVideoState(view.video, { readyState: 4, duration: 60 });
  advance();
  return view;
}

describe('DriveVideo', () => {
  beforeEach(() => {
    mocks.hls = null;
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    vi.stubGlobal('MediaSource', class {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function () { setVideoState(this, { error: null }); });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () { setVideoState(this, { paused: true }); });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function () { setVideoState(this, { paused: false }); });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('loads the drive with hls.js from the start of the selected range', async () => {
    const { video, unmount } = await mount();
    expect(mocks.hls.loadSource).toHaveBeenCalledWith('https://example.com/route/qcamera.m3u8');
    expect(mocks.hls.attachMedia).toHaveBeenCalledWith(video);
    expect(getVideo()).toBe(video);

    hlsEvent('hlsManifestParsed');
    expect(mocks.hls.startLoad).toHaveBeenCalledWith(8);

    unmount();
    expect(mocks.hls.destroy).toHaveBeenCalled();
    expect(getVideo()).toBeNull();
  });

  it('reports what the video does, also when something outside the page pauses it', async () => {
    const { store, video } = await mountPlaying();
    expect(store.getState()).toMatchObject({ isPlaying: true, offset: 10000 });

    video.currentTime = 20;
    video.pause();
    fireEvent.pause(video);
    expect(store.getState()).toMatchObject({ isPlaying: false, offset: 22000 });
  });

  it('reports whether the drive has audio', async () => {
    const { onAudioStatusChange } = await mount();
    hlsEvent('hlsBufferCodecs', { audio: {}, video: {} });
    expect(onAudioStatusChange).toHaveBeenLastCalledWith(true);
  });

  it('repeats the selected range', async () => {
    const { store, video } = await mountPlaying();
    video.currentTime = 48.1;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toEqual(8);

    video.currentTime = 48;
    setVideoState(video, { ended: true, paused: true });
    fireEvent.pause(video);
    expect(video.currentTime).toEqual(8);
    expect(video.paused).toBe(false);
    expect(store.getState().isPlaying).toBe(true);
  });

  it('plays on through a range with no length', async () => {
    const { video } = await mountPlaying({ zoom: { start: 20000, end: 20000 } });
    video.currentTime = 30;
    advance();
    expect(video.currentTime).toEqual(30);
  });

  it.each([
    ['before the video starts', { start: 0, end: 1500 }],
    ['after the video ends', { start: 70000, end: 80000 }],
  ])('pauses with a message when the range is %s', async (_name, zoom) => {
    const { store, video } = await mountPlaying({ zoom });
    advance();
    expect(video.paused).toBe(true);
    expect(store.getState().isPlaying).toBe(false);
    expect(screen.getByText(MISSING_SEGMENT)).toBeInTheDocument();
  });

  describe('a drive that is still uploading', () => {
    // the playlist has 9 of the drive's 16 segments, so the video ends at 60 s
    async function mountUploading() {
      const view = await mountPlaying({
        currentRoute: { ...route, duration: 120000, segment_numbers: [...Array(16).keys()] },
        zoom: { start: 10000, end: 120000 },
      });
      mocks.hls.latestLevelDetails = { fragments: Array(9).fill({}), fragmentEnd: 60 };
      return view;
    }

    it('stops on the last frame of its video', async () => {
      const { video } = await mountUploading();
      video.currentTime = 60;
      setVideoState(video, { ended: true, paused: true });
      fireEvent.pause(video);
      advance();
      expect(video.currentTime).toEqual(60);
      expect(screen.queryByText(MISSING_SEGMENT)).toBeNull();
    });

    it('shows a blank picture with a message past the end of its video', async () => {
      const { store, video } = await mountUploading();
      act(() => store.dispatch(seek(90000)));
      video.currentTime = 60;
      setVideoState(video, { ended: true, paused: true });
      fireEvent.pause(video);
      advance();
      expect(currentOffset(store.getState())).toEqual(90000);
      expect(screen.getByText(MISSING_SEGMENT)).toBeInTheDocument();
      expect(video).toHaveClass('invisible');
    });
  });

  describe('missing segments', () => {
    it('skips one once the video before it has played, with no message over the video', async () => {
      const { video } = await mountPlaying();
      missingSegment(20, 30);
      video.currentTime = 19.9;
      advance();
      expect(video.currentTime).toEqual(19.9);

      setVideoState(video, { readyState: 2 });
      advance();
      expect(video.currentTime).toBeCloseTo(30, 2);
      expect(mocks.hls.startLoad).toHaveBeenLastCalledWith(video.currentTime);
      expect(screen.queryByText(MISSING_SEGMENT)).toBeNull();
    });

    it('shows a blank picture with a message when paused inside one', async () => {
      const { video } = await mountPlaying();
      missingSegment(40, 50);
      video.pause();
      fireEvent.pause(video);
      video.currentTime = 45;
      advance();
      expect(screen.getByText(MISSING_SEGMENT)).toBeInTheDocument();
      expect(video).toHaveClass('invisible');
    });

    it('crosses one backwards when seeking back into it', async () => {
      const { video } = await mountPlaying();
      missingSegment(20, 30);
      video.currentTime = 32;
      advance();
      video.currentTime = 27;
      setVideoState(video, { seeking: true });
      fireEvent.seeking(video);
      expect(video.currentTime).toEqual(17);
    });

    it('starts after one at the start of the range', async () => {
      const { store } = await mount({ zoom: { start: 30000, end: 50000 } });
      hlsEvent('hlsManifestParsed');
      missingSegment(20, 30);
      advance(32); // one frame reports playback, the next skips the gap
      expect(videoTime(route, currentOffset(store.getState()))).toBeCloseTo(30, 2);
      expect(screen.queryByText(MISSING_SEGMENT)).toBeNull();
    });

    it('repeats the range from after one at its start', async () => {
      const { video } = await mountPlaying();
      missingSegment(5, 15);
      video.currentTime = 48.1;
      fireEvent.timeUpdate(video);
      expect(video.currentTime).toBeCloseTo(15, 2);
    });

    it('plays one that loads after all', async () => {
      const { video } = await mountPlaying();
      missingSegment(20, 30);
      hlsEvent('hlsFragBuffered', { frag: { start: 20, end: 30 } });
      video.currentTime = 20.5;
      advance();
      expect(video.currentTime).toEqual(20.5);
    });
  });

  it('skips a segment the browser can\'t decode', async () => {
    const { video } = await mountPlaying();
    mocks.hls.latestLevelDetails = { fragments: [0, 10, 20, 30, 40, 50].map((start) => ({ start, end: start + 10 })), fragmentEnd: 60 };
    setVideoState(video, { error: { code: 3 } });
    video.currentTime = 15;
    fireEvent.error(video);
    expect(mocks.hls.recoverMediaError).toHaveBeenCalled();
    expect(video.currentTime).toBeCloseTo(20, 2);
    expect(video.paused).toBe(false);
  });

  it('recovers from a media error where it was', async () => {
    const { store, video } = await mountPlaying();
    video.currentTime = 20;
    hlsEvent('hlsError', { type: 'mediaError', details: 'bufferAppendError', fatal: true });
    expect(mocks.hls.recoverMediaError).toHaveBeenCalled();
    expect(mocks.hls.startLoad).toHaveBeenLastCalledWith(20);
    expect(currentOffset(store.getState())).toEqual(22000);
    expect(video.paused).toBe(false);
  });

  it.each([
    ['a seek', (video) => fireEvent.seeking(video)],
    ['play', (video) => fireEvent.play(video)],
    ['the network coming back', () => fireEvent(window, new Event('online'))],
  ])('loads again after hls.js gives up, on %s', async (_name, retry) => {
    const { store, video } = await mountPlaying();
    missingSegment(20, 30, true);
    act(() => store.dispatch(seek(42000)));
    retry(video);
    expect(mocks.hls.startLoad).toHaveBeenLastCalledWith(40);
  });

  it('retries by itself while stuck, further apart each time, and only then shows an error', async () => {
    const { video } = await mountPlaying();
    const networkError = () => hlsEvent('hlsError', { type: 'networkError', details: 'fragLoadError', fatal: true, frag: { start: 0, end: 10 } });
    networkError();
    video.currentTime = 1;
    advance();
    expect(screen.queryByText('Unable to load video')).toBeNull();

    setVideoState(video, { readyState: 2 });
    advance(500);
    expect(screen.getByText('Unable to load video')).toBeInTheDocument();
    const retries = () => mocks.hls.startLoad.mock.calls.length;
    const first = retries();
    networkError();
    advance(2500);
    expect(retries()).toEqual(first + 1);
    networkError();
    advance(2500);
    expect(retries()).toEqual(first + 1);
    advance(2000);
    expect(retries()).toEqual(first + 2);

    hlsEvent('hlsFragBuffered', { frag: { start: 0, end: 10 } });
    advance();
    expect(screen.queryByText('Unable to load video')).toBeNull();
  });

  it('reloads the playlist when its links expire, from where it was', async () => {
    const { store, video } = await mountPlaying();
    video.currentTime = 30;
    hlsEvent('hlsError', { type: 'networkError', details: 'fragLoadError', fatal: true, frag: { start: 30, end: 40 }, response: { code: 403 } });
    expect(mocks.hls.loadSource).toHaveBeenCalledTimes(2);
    expect(currentOffset(store.getState())).toEqual(32000);
    expect(video.paused).toBe(false);
  });

  it('reloads a playlist that failed to load when the network comes back', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await mount();
    const manifestError = () => hlsEvent('hlsError', { type: 'networkError', details: 'manifestLoadError', fatal: true });
    manifestError();
    advance(500);
    expect(screen.getByText('Unable to load video. Check network connection.')).toBeInTheDocument();
    manifestError(); // the retry while offline fails too

    onLine.mockReturnValue(true);
    fireEvent(window, new Event('online'));
    expect(mocks.hls.loadSource).toHaveBeenCalledTimes(3);
  });

  it('says when the drive has no video, and keeps the timeline seekable', async () => {
    const { store, video } = await mount();
    hlsEvent('hlsError', { type: 'networkError', details: 'manifestLoadError', fatal: true, response: { code: 404 } });
    advance();
    expect(screen.getByText('This video has not uploaded yet or has been deleted.')).toBeInTheDocument();
    expect(video.paused).toBe(true);

    act(() => store.dispatch(seek(30000)));
    expect(video.currentTime).toEqual(28);
  });

  it('shows the spinner only once playback has waited a moment for data', async () => {
    HTMLMediaElement.prototype.play.mockRejectedValueOnce(new DOMException('', 'NotAllowedError'));
    const { store, video } = await mount();
    advance(500);
    expect(store.getState().isPlaying).toBe(false); // autoplay refused, with no error
    expect(screen.queryByText('Unable to load video')).toBeNull();

    act(() => store.dispatch(play()));
    advance(100);
    expect(screen.queryByRole('progressbar')).toBeNull();
    advance(500);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    video.currentTime = 1;
    advance();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('restarts loading on a seek away from a segment hls.js is part way through', async () => {
    const { video } = await mountPlaying();
    hlsEvent('hlsFragLoading', { frag: { start: 60, end: 120 } });
    setVideoState(video, { buffered: { length: 1, start: () => 0, end: () => 60 } });
    video.currentTime = 30;
    fireEvent.seeking(video);
    expect(mocks.hls.startLoad).not.toHaveBeenCalledWith(30);

    video.currentTime = 300;
    fireEvent.seeking(video);
    expect(mocks.hls.startLoad).toHaveBeenLastCalledWith(300);
  });

  it('carries on where it was after the page reloads', async () => {
    sessionStorage.setItem('driveVideoPosition', JSON.stringify({ route: 'route', zoom: { start: 10000, end: 50000 }, offset: 30000 }));
    const { store, unmount } = await mount();
    expect(currentOffset(store.getState())).toEqual(30000);

    unmount();
    expect(sessionStorage.getItem('driveVideoPosition')).toBeNull();
  });

  it('moves to the same moment of the drive once it\'s known where the video starts', async () => {
    const { store } = await mount({ currentRoute: { ...route, videoStartOffset: undefined } });
    hlsEvent('hlsManifestParsed');
    expect(mocks.hls.startLoad).toHaveBeenLastCalledWith(10);
    act(() => store.dispatch({ type: 'TEST_ROUTE', route }));
    expect(mocks.hls.startLoad).toHaveBeenLastCalledWith(8);
  });

  describe('without Media Source Extensions', () => {
    beforeEach(() => {
      vi.unstubAllGlobals();
    });

    it('uses the browser\'s own HLS playback', async () => {
      const { video } = await mount();
      expect(mocks.hls).toBeNull();
      expect(video.src).toEqual('https://example.com/route/qcamera.m3u8');
      expect(video.currentTime).toEqual(8);
    });

    it('uses hls.js on iPhone, which has ManagedMediaSource', async () => {
      vi.stubGlobal('ManagedMediaSource', class {});
      const { video } = await mount();
      expect(mocks.hls.attachMedia).toHaveBeenCalledWith(video);
    });
  });
});
