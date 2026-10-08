import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import store from '../../store';
import { currentOffset, setVideo } from '../../timeline';
import { reducer, seek, selectLoop } from '../../timeline/playback';
import DriveVideo from '.';

const mocks = vi.hoisted(() => ({ ios: false, hls: [] }));

vi.mock('../../store', async () => {
  const { applyMiddleware, createStore } = await import('redux');
  const { default: thunk } = await import('redux-thunk');
  return { default: createStore((state) => state, {}, applyMiddleware(thunk)) };
});
vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (fullname) => `https://video.test/${fullname}/qcamera.m3u8` } },
}));
vi.mock('../../utils/browser.js', () => ({ isIos: () => mocks.ios }));
vi.mock('hls.js/dist/hls.worker.js?url', () => ({ default: '/hls.worker.js' }));
vi.mock('hls.js/light', () => {
  class Hls {
    static Events = { BUFFER_CODECS: 'hlsBufferCodecs', ERROR: 'hlsError' };

    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };

    constructor(config) {
      this.config = config;
      this.handlers = {};
      this.loadSource = vi.fn();
      this.attachMedia = vi.fn();
      this.recoverMediaError = vi.fn();
      this.destroy = vi.fn();
      mocks.hls.push(this);
    }

    on(event, handler) {
      this.handlers[event] = handler;
    }

    emit(event, data) {
      this.handlers[event](event, data);
    }
  }
  return { default: Hls };
});

const SET_STATE = 'test_set_state';
const ROUTE = { fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00', videoStartOffset: 2000 };
const SRC = `https://video.test/${ROUTE.fullname}/qcamera.m3u8`;
const NETWORK_ERROR = 'Unable to load video. Check network connection.';

// jsdom has no media pipeline, so the tests play the browser's part by setting
// the element's state and firing its events
function setMedia(video, props) {
  Object.entries(props).forEach(([key, value]) => {
    Object.defineProperty(video, key, { value, writable: true, configurable: true });
  });
}

function renderVideo(state = {}, props = {}) {
  store.dispatch({ type: SET_STATE, state: { currentRoute: ROUTE, offset: null, loop: null, ...state } });
  const { container } = render(
    <Provider store={store}>
      <DriveVideo isMuted {...props} />
    </Provider>,
  );
  const video = container.querySelector('video');
  setMedia(video, { readyState: HTMLMediaElement.HAVE_NOTHING, currentTime: 0, paused: true, playbackRate: 1 });
  return video;
}

describe('DriveVideo', () => {
  let canPlayHls;

  beforeAll(() => {
    store.replaceReducer((state, action) => reducer(action.type === SET_STATE ? { ...state, ...action.state } : state, action));
  });

  beforeEach(() => {
    mocks.ios = false;
    mocks.hls.length = 0;
    canPlayHls = false;
    window.MediaSource = class {};
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type) => (
      canPlayHls && type === 'application/vnd.apple.mpegurl' ? 'maybe' : ''));
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup(); // unmount while the media stubs are still in place
    delete window.MediaSource;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setVideo(null);
  });

  describe('choosing a player', () => {
    it('uses hls.js where MediaSource exists', async () => {
      canPlayHls = true; // newer desktop Chrome also says it can play HLS
      const video = renderVideo();
      await waitFor(() => expect(mocks.hls).toHaveLength(1));
      expect(mocks.hls[0].loadSource).toHaveBeenCalledWith(SRC);
      expect(mocks.hls[0].attachMedia).toHaveBeenCalledWith(video);
      expect(video).not.toHaveAttribute('src');
    });

    it('plays HLS natively on iOS', () => {
      mocks.ios = true;
      canPlayHls = true;
      const onAudioStatusChange = vi.fn();
      const video = renderVideo({}, { onAudioStatusChange });
      expect(video).toHaveAttribute('src', SRC);

      setMedia(video, { readyState: HTMLMediaElement.HAVE_METADATA, audioTracks: { length: 1 } });
      fireEvent.loadedMetadata(video);
      expect(onAudioStatusChange).toHaveBeenCalledWith(true);
      expect(mocks.hls).toHaveLength(0);
    });

    it('plays HLS natively where there is no MediaSource', () => {
      delete window.MediaSource;
      canPlayHls = true;
      expect(renderVideo()).toHaveAttribute('src', SRC);
    });

    it('starts hls.js at the deep linked position and reports audio', async () => {
      const onAudioStatusChange = vi.fn();
      renderVideo({ offset: 92000 }, { onAudioStatusChange });
      await waitFor(() => expect(mocks.hls).toHaveLength(1));
      expect(mocks.hls[0].config.startPosition).toEqual(90);

      act(() => mocks.hls[0].emit('hlsBufferCodecs', { audio: {}, video: {} }));
      expect(onAudioStatusChange).toHaveBeenCalledWith(true);
    });
  });

  describe('the video drives playback', () => {
    it('is the clock the timeline reads', () => {
      const video = renderVideo();
      setMedia(video, { readyState: HTMLMediaElement.HAVE_ENOUGH_DATA, currentTime: 61.5 });
      expect(currentOffset()).toEqual(63500);
    });

    it('reports its play state to the store', () => {
      const video = renderVideo();
      setMedia(video, { paused: false, playbackRate: 2 });
      fireEvent.play(video);
      expect(store.getState()).toMatchObject({ isPlaying: true, playSpeed: 2 });

      setMedia(video, { paused: true });
      fireEvent.pause(video);
      expect(store.getState().isPlaying).toBe(false);
    });

    it('plays, pauses and seeks the video', () => {
      const video = renderVideo();
      setMedia(video, { readyState: HTMLMediaElement.HAVE_ENOUGH_DATA });

      fireEvent.click(video);
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);

      setMedia(video, { paused: false });
      fireEvent.click(video);
      expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);

      act(() => store.dispatch(seek(32000)));
      expect(video.currentTime).toEqual(30);
    });

    it('applies a seek made while loading once the video has loaded', () => {
      const video = renderVideo();
      act(() => store.dispatch(seek(42000)));
      expect(video.currentTime).toEqual(0);

      setMedia(video, { readyState: HTMLMediaElement.HAVE_METADATA });
      fireEvent.loadedMetadata(video);
      expect(video.currentTime).toEqual(40);
    });

    it('plays straight across segment boundaries', () => {
      const video = renderVideo();
      setMedia(video, { readyState: HTMLMediaElement.HAVE_ENOUGH_DATA, paused: false, currentTime: 59.9 });
      fireEvent.timeUpdate(video);
      expect(currentOffset()).toBeCloseTo(61900);

      setMedia(video, { currentTime: 60.1 });
      fireEvent.timeUpdate(video);
      expect(currentOffset()).toBeCloseTo(62100);
      expect(video.currentTime).toEqual(60.1);
      expect(store.getState().offset).toBeNull();
    });

    it('loops the selection', () => {
      const video = renderVideo();
      act(() => store.dispatch(selectLoop(50000, 70000)));
      setMedia(video, { readyState: HTMLMediaElement.HAVE_ENOUGH_DATA, paused: false, currentTime: 67.9 });
      fireEvent.timeUpdate(video);
      expect(video.currentTime).toEqual(67.9);

      setMedia(video, { currentTime: 68.1 });
      fireEvent.timeUpdate(video);
      expect(video.currentTime).toEqual(48);
    });

    it('starts over when the route ends', () => {
      const video = renderVideo();
      setMedia(video, { readyState: HTMLMediaElement.HAVE_ENOUGH_DATA, currentTime: 600 });
      fireEvent.ended(video);
      expect(video.currentTime).toEqual(0);
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });
  });

  describe('errors', () => {
    it('shows an error and Retry resumes at the same time', async () => {
      const video = renderVideo();
      await waitFor(() => expect(mocks.hls).toHaveLength(1));
      setMedia(video, { readyState: HTMLMediaElement.HAVE_ENOUGH_DATA, currentTime: 100 });

      act(() => mocks.hls[0].emit('hlsError', { fatal: true, type: 'networkError' }));
      expect(screen.getByText(NETWORK_ERROR)).toBeInTheDocument();

      fireEvent.click(screen.getByText('Retry'));
      setMedia(video, { readyState: HTMLMediaElement.HAVE_NOTHING, currentTime: 0 }); // hls.js detached
      expect(mocks.hls[0].destroy).toHaveBeenCalled();
      expect(screen.queryByText(NETWORK_ERROR)).not.toBeInTheDocument();

      await waitFor(() => expect(mocks.hls).toHaveLength(2));
      expect(mocks.hls[1].config.startPosition).toEqual(100);
    });

    it('retries by itself when the browser comes back online', async () => {
      renderVideo();
      await waitFor(() => expect(mocks.hls).toHaveLength(1));
      act(() => mocks.hls[0].emit('hlsError', { fatal: true, type: 'networkError' }));

      act(() => window.dispatchEvent(new Event('online')));
      await waitFor(() => expect(mocks.hls).toHaveLength(2));
      expect(screen.queryByText(NETWORK_ERROR)).not.toBeInTheDocument();
    });

    it('says when the video is missing', async () => {
      renderVideo();
      await waitFor(() => expect(mocks.hls).toHaveLength(1));
      act(() => mocks.hls[0].emit('hlsError', { fatal: true, type: 'networkError', response: { code: 404 } }));
      expect(screen.getByText('This video segment has not uploaded yet or has been deleted.')).toBeInTheDocument();
    });

    it('recovers from one media error before showing it', async () => {
      const video = renderVideo();
      await waitFor(() => expect(mocks.hls).toHaveLength(1));
      setMedia(video, { readyState: HTMLMediaElement.HAVE_ENOUGH_DATA, currentTime: 100 });

      act(() => mocks.hls[0].emit('hlsError', { fatal: true, type: 'mediaError' }));
      expect(mocks.hls[0].recoverMediaError).toHaveBeenCalledTimes(1);
      expect(store.getState().offset).toEqual(102000);
      expect(screen.queryByText('Retry')).not.toBeInTheDocument();

      act(() => mocks.hls[0].emit('hlsError', { fatal: true, type: 'mediaError' }));
      expect(screen.getByText('Unable to load video')).toBeInTheDocument();
    });

    it('ignores errors hls.js recovers from', async () => {
      renderVideo();
      await waitFor(() => expect(mocks.hls).toHaveLength(1));
      act(() => mocks.hls[0].emit('hlsError', { fatal: false, type: 'networkError' }));
      expect(screen.queryByText('Retry')).not.toBeInTheDocument();
    });

    it('shows native playback errors and Retry resumes at the same time', () => {
      vi.stubGlobal('MediaError', { MEDIA_ERR_NETWORK: 2 });
      mocks.ios = true;
      canPlayHls = true;
      const video = renderVideo();
      setMedia(video, { readyState: HTMLMediaElement.HAVE_ENOUGH_DATA, currentTime: 100, error: { code: 2 } });
      fireEvent.error(video);
      expect(screen.getByText(NETWORK_ERROR)).toBeInTheDocument();

      fireEvent.click(screen.getByText('Retry'));
      expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
      expect(video).toHaveAttribute('src', SRC);
      expect(screen.queryByText(NETWORK_ERROR)).not.toBeInTheDocument();

      setMedia(video, { readyState: HTMLMediaElement.HAVE_METADATA, currentTime: 0, error: null });
      fireEvent.loadedMetadata(video);
      expect(video.currentTime).toEqual(100);
    });
  });
});
