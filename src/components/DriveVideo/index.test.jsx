import React from 'react';
import { Provider } from 'react-redux';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { pushTimelineRange } from '../../actions';
import * as Types from '../../actions/types';
import store from '../../store';
import { currentOffset } from '../../timeline';
import { pause, play, seek, selectLoop } from '../../timeline/playback';
import DriveVideo from '.';

const DONGLE = 'aaaaaaaaaaaaaaaa';
const LOG = '2026-08-06--12-00-00';
const OTHER_LOG = '2026-08-06--13-00-00';

const ROUTE_DURATION_MS = 60000;
const FULL_VIDEO_S = 60;
const SHORT_VIDEO_S = 30;
const LONGER_THAN_ROUTE_VIDEO_S = 65;
// a seek past the end of the video parks the element this close to the end
const LAST_FRAME_S = 29.5;
const BUFFERING_DELAY_MS = 250;

const hls = vi.hoisted(() => ({
  instances: [],
  Hls: class Hls {
    static Events = { ERROR: 'hlsError', BUFFER_CODECS: 'hlsBufferCodecs', MEDIA_ATTACHED: 'hlsMediaAttached' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };

    handlers = {};
    attachMedia = vi.fn();
    destroy = vi.fn();
    loadSource = vi.fn();
    recoverMediaError = vi.fn();

    constructor(config) {
      this.config = config;
      hls.instances.push(this);
    }

    on(event, handler) {
      this.handlers[event] = handler;
    }

    emit(event, data) {
      act(() => this.handlers[event](event, data));
    }
  },
}));
vi.mock('hls.js/light', () => ({ default: hls.Hls }));

function loadRoutes(logs) {
  const routes = logs.map((log) => ({
    fullname: `${DONGLE}|${log}`,
    log_id: log,
    duration: ROUTE_DURATION_MS,
    segment_numbers: [0],
    start_time_utc_millis: 0,
  }));
  store.dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId: DONGLE, start: 0, end: 1, routes });
}

function setMedia(video, props) {
  Object.entries(props).forEach(([key, value]) => {
    Object.defineProperty(video, key, { value, writable: true, configurable: true });
  });
}

function dispatchFirstFrameEvent(routeOffsetMillis) {
  const event = { type: 'event', route_offset_millis: routeOffsetMillis, data: { event_type: 'first_road_camera_frame' } };
  act(() => {
    store.dispatch({ type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: `${DONGLE}|${LOG}`, events: [event] });
  });
}

// jsdom does not play media, so the element is a stand-in that records currentTime writes
function renderVideo(props = {}, durationSeconds = FULL_VIDEO_S) {
  const view = render(<Provider store={store}><DriveVideo isMuted {...props} /></Provider>);
  const video = document.querySelector('video');
  const writes = [];
  let time = 0;
  setMedia(video, { readyState: HTMLMediaElement.HAVE_METADATA, duration: durationSeconds, ended: false });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (seconds) => {
      // browsers never finish a seek to the very end, and a seek clears ended
      expect(seconds).toBeLessThan(durationSeconds);
      writes.push(seconds);
      time = seconds;
      video.ended = false;
    },
  });
  const playToEnd = () => {
    time = durationSeconds;
    video.ended = true;
    fireEvent.pause(video);
    fireEvent.ended(video);
  };
  return { ...view, video, writes, playToEnd };
}

async function renderHls(props) {
  vi.stubGlobal('MediaSource', class {});
  const view = renderVideo(props);
  view.video.readyState = HTMLMediaElement.HAVE_NOTHING;
  await vi.waitFor(() => expect(hls.instances).toHaveLength(1));
  return { ...view, player: hls.instances[0] };
}

function advance(ms) {
  act(() => vi.advanceTimersByTime(ms));
}

describe('DriveVideo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    act(() => {
      loadRoutes([LOG, OTHER_LOG]);
      store.dispatch(pushTimelineRange(LOG, null, null, false));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    hls.instances = [];
  });

  describe('commands', () => {
    it('does not write to the video during steady playback', () => {
      const setRate = vi.spyOn(HTMLMediaElement.prototype, 'playbackRate', 'set');
      const { video, writes } = renderVideo();
      setMedia(video, { paused: false });
      fireEvent.timeUpdate(video);
      expect(writes).toEqual([]);
      expect(setRate).not.toHaveBeenCalled();
    });

    it('writes the video time once for a seek', () => {
      const { writes } = renderVideo();
      act(() => store.dispatch(seek(6000)));
      expect(writes).toEqual([6]);
    });

    it('pauses the video once for a pause command', () => {
      const { video } = renderVideo();
      act(() => store.dispatch(pause()));
      expect(video.pause).toHaveBeenCalledTimes(1);
    });

    it('sets the rate for a play command and keeps it for a play from outside the page', () => {
      const { video } = renderVideo();
      act(() => store.dispatch(play(2)));
      expect(video.playbackRate).toBe(2);
      act(() => store.dispatch(pause()));
      fireEvent.play(video);
      expect(store.getState().desiredPlaySpeed).toBe(2);
    });

    it('follows a pause from outside the page', () => {
      const { video } = renderVideo();
      fireEvent.pause(video);
      expect(store.getState().desiredPlaySpeed).toBe(0);
    });
  });

  describe('clock', () => {
    it('holds until the routes load', () => {
      act(() => {
        loadRoutes([]);
        store.dispatch(pushTimelineRange(LOG, null, null, false));
      });
      advance(3000);
      expect(currentOffset()).toBe(0);
    });

    it('holds a seek made before the metadata loads and applies it once loaded', () => {
      const { video } = renderVideo({}, SHORT_VIDEO_S);
      video.readyState = HTMLMediaElement.HAVE_NOTHING;
      act(() => store.dispatch(seek(4000)));
      advance(1000);
      expect(currentOffset()).toBe(4000);
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      fireEvent.loadedMetadata(video);
      expect(video.currentTime).toBe(4);
    });

    it('parks the video at its end for a seek past the end made before the metadata loads', () => {
      const { video } = renderVideo({}, SHORT_VIDEO_S);
      video.readyState = HTMLMediaElement.HAVE_NOTHING;
      act(() => store.dispatch(seek(40000)));
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      fireEvent.loadedMetadata(video);
      expect(video.currentTime).toBe(LAST_FRAME_S);
      advance(1000);
      expect(currentOffset()).toBe(41000);
    });

    it('offsets the video time by the first camera frame', () => {
      dispatchFirstFrameEvent(2000);
      const { writes } = renderVideo();
      act(() => store.dispatch(seek(6000)));
      expect(writes).toEqual([4]);
      expect(currentOffset()).toBe(6000);
    });

    it('keeps the shown time when the first camera frame arrives after a seek', () => {
      const { writes } = renderVideo();
      act(() => store.dispatch(seek(6000)));
      dispatchFirstFrameEvent(2000);
      expect(currentOffset()).toBe(6000);
      expect(writes).toEqual([6, 4]);
    });
  });

  describe('route change', () => {
    it('mounts a new video for the new route', () => {
      const { video, writes } = renderVideo();
      act(() => store.dispatch(pushTimelineRange(OTHER_LOG, 0, ROUTE_DURATION_MS, false)));
      expect(document.querySelector('video')).not.toBe(video);
      expect(document.querySelector('video').src).toContain(OTHER_LOG);
      expect(writes).toEqual([]);
    });

    it('ignores a refused play of the old route', async () => {
      let refuse;
      HTMLMediaElement.prototype.play.mockReturnValueOnce(new Promise((_resolve, reject) => { refuse = reject; }));
      renderVideo();
      act(() => store.dispatch(pushTimelineRange(OTHER_LOG, 0, ROUTE_DURATION_MS, false)));
      await act(async () => refuse(Object.assign(new Error('denied'), { name: 'NotAllowedError' })));
      expect(store.getState().desiredPlaySpeed).toBe(1);
    });
  });

  describe('refused play', () => {
    async function renderRefused(name) {
      HTMLMediaElement.prototype.play.mockRejectedValueOnce(Object.assign(new Error('refused'), { name }));
      renderVideo();
      await act(async () => {});
      advance(BUFFERING_DELAY_MS + 50);
    }

    it('pauses and shows no spinner when autoplay is refused', async () => {
      await renderRefused('NotAllowedError');
      expect(store.getState().desiredPlaySpeed).toBe(0);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('keeps playing when play is interrupted', async () => {
      await renderRefused('AbortError');
      expect(store.getState().desiredPlaySpeed).toBe(1);
      expect(screen.getByRole('progressbar')).toBeVisible();
    });
  });

  describe('loop', () => {
    it('wraps to the loop start when playback passes the loop end', () => {
      store.dispatch(selectLoop(10000, 20000));
      const { video } = renderVideo();
      setMedia(video, { paused: false });
      video.currentTime = 21;
      fireEvent.timeUpdate(video);
      expect(video.currentTime).toBe(10);
    });

    it('clamps a seek past the loop end to the loop end', () => {
      store.dispatch(selectLoop(10000, 20000));
      const { video } = renderVideo();
      act(() => store.dispatch(seek(25000)));
      expect(video.currentTime).toBe(20);
    });

    it('restarts at the loop start when the video ends', () => {
      store.dispatch(selectLoop(10000, 60000));
      const { video, playToEnd } = renderVideo();
      video.play.mockClear();
      playToEnd();
      advance(0);
      expect(video.currentTime).toBe(10);
      expect(video.play).toHaveBeenCalledTimes(1);
    });

    it('restarts at once when the video is longer than the route', () => {
      const { video, playToEnd } = renderVideo({}, LONGER_THAN_ROUTE_VIDEO_S);
      video.play.mockClear();
      playToEnd();
      advance(1000);
      expect(video.currentTime).toBe(0);
      expect(video.play).toHaveBeenCalledTimes(1);
    });
  });

  describe('video shorter than the route', () => {
    it('keeps the clock running after the video ends', () => {
      const { playToEnd } = renderVideo({}, SHORT_VIDEO_S);
      playToEnd();
      advance(20000);
      expect(currentOffset()).toBe(50000);
    });

    it('returns to the last frame without a spinner when the browser plays the ended video', () => {
      const { video, playToEnd } = renderVideo({}, SHORT_VIDEO_S);
      playToEnd();
      advance(20000);
      video.currentTime = 0;
      fireEvent.play(video);
      expect(video.currentTime).toBe(LAST_FRAME_S);
      expect(currentOffset()).toBe(50000);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('plays on the clock past its end and restarts the video at the end of the route', () => {
      const { video } = renderVideo({}, SHORT_VIDEO_S);
      act(() => store.dispatch(seek(40000)));
      video.play.mockClear();
      act(() => store.dispatch(play(2)));
      expect(video.play).not.toHaveBeenCalled();
      advance(10000);
      expect(video.currentTime).toBe(0);
      expect(video.play).toHaveBeenCalledTimes(1);
    });

    it('wraps the clock inside a new range past the video end', () => {
      const { playToEnd } = renderVideo({}, SHORT_VIDEO_S);
      playToEnd();
      act(() => store.dispatch(pushTimelineRange(LOG, 40000, 50000, false)));
      advance(12000);
      expect(currentOffset()).toBe(42000);
    });
  });

  describe('seeking back from past the video end', () => {
    function renderPastEnd({ paused }) {
      const view = renderVideo({}, SHORT_VIDEO_S);
      if (paused) act(() => store.dispatch(pause()));
      act(() => store.dispatch(seek(40000)));
      expect(view.video.currentTime).toBe(LAST_FRAME_S);
      view.video.play.mockClear();
      return view;
    }

    it.each([
      { state: 'playing', paused: false, plays: 1 },
      { state: 'paused', paused: true, plays: 0 },
    ])('keeps the $state state after a seek', ({ paused, plays }) => {
      const { video } = renderPastEnd({ paused });
      act(() => store.dispatch(seek(10000)));
      expect(currentOffset()).toBe(10000);
      expect(video.play).toHaveBeenCalledTimes(plays);
    });

    it('plays after selecting a new range', () => {
      const { video } = renderPastEnd({ paused: false });
      act(() => store.dispatch(pushTimelineRange(LOG, 10000, 20000, false)));
      expect(currentOffset()).toBe(10000);
      expect(video.play).toHaveBeenCalledTimes(1);
    });
  });

  describe('buffering spinner', () => {
    it('appears after a short delay', () => {
      const { video } = renderVideo();
      fireEvent.playing(video);
      fireEvent.waiting(video);
      advance(BUFFERING_DELAY_MS - 50);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      advance(100);
      expect(screen.getByRole('progressbar')).toBeVisible();
    });

    it('goes away when the video plays', () => {
      const { video } = renderVideo();
      fireEvent.waiting(video);
      advance(BUFFERING_DELAY_MS + 50);
      fireEvent.playing(video);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('goes away when the time advances without a playing event', () => {
      const { video } = renderVideo();
      fireEvent.waiting(video);
      advance(BUFFERING_DELAY_MS + 50);
      setMedia(video, { readyState: HTMLMediaElement.HAVE_CURRENT_DATA });
      video.currentTime = 1;
      fireEvent.timeUpdate(video);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  describe('native playback', () => {
    const MEDIA_ERRORS = [
      { name: 'a network error', code: 2, message: 'Unable to load video. Check network connection.' },
      { name: 'a decode error', code: 3, message: 'Unable to load video' },
    ];

    it.each(MEDIA_ERRORS)('shows $name with a retry button', ({ code, message }) => {
      const { video } = renderVideo();
      setMedia(video, { error: { code } });
      fireEvent.error(video);
      expect(screen.getByText(message)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
    });

    it('reports no audio for a video without audio tracks', () => {
      const onAudioStatusChange = vi.fn();
      const { video } = renderVideo({ onAudioStatusChange });
      setMedia(video, { audioTracks: { length: 0 } });
      fireEvent.loadedData(video);
      expect(onAudioStatusChange).toHaveBeenCalledWith(false);
    });
  });

  describe('hls.js', () => {
    it('attaches to the video, starts at the clock position and plays', async () => {
      const { video, player } = await renderHls();
      expect(player.attachMedia).toHaveBeenCalledWith(video);
      expect(player.config.startPosition).toBe(0);
      player.emit('hlsMediaAttached');
      expect(video.play).toHaveBeenCalledTimes(1);
    });

    it('ignores the player when the component unmounts before it loads', async () => {
      vi.stubGlobal('MediaSource', class {});
      renderVideo().unmount();
      await act(() => import('hls.js/light'));
      expect(hls.instances).toHaveLength(0);
    });

    it('reports audio only when the codecs include it', async () => {
      const onAudioStatusChange = vi.fn();
      const { player } = await renderHls({ onAudioStatusChange });
      player.emit('hlsBufferCodecs', { video: {} });
      expect(onAudioStatusChange).not.toHaveBeenCalled();
      player.emit('hlsBufferCodecs', { audio: {}, video: {} });
      expect(onAudioStatusChange).toHaveBeenCalledWith(true);
    });

    it('ignores a non-fatal error', async () => {
      const { player } = await renderHls();
      player.emit('hlsError', { fatal: false, type: 'networkError' });
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });

    describe('fatal media error', () => {
      const POSITION_S = 12;

      async function renderPlayingHls() {
        const view = await renderHls();
        setMedia(view.video, { readyState: HTMLMediaElement.HAVE_METADATA });
        view.video.currentTime = POSITION_S;
        return view;
      }

      it('recovers once and keeps the position', async () => {
        const { video, player } = await renderPlayingHls();
        player.emit('hlsError', { fatal: true, type: 'mediaError' });
        video.readyState = HTMLMediaElement.HAVE_NOTHING;
        expect(player.recoverMediaError).toHaveBeenCalledTimes(1);
        expect(currentOffset()).toBe(POSITION_S * 1000);

        video.readyState = HTMLMediaElement.HAVE_METADATA;
        video.currentTime = 0;
        fireEvent.loadedMetadata(video);
        expect(video.currentTime).toBe(POSITION_S);
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
      });

      it('shows an error when it happens again', async () => {
        const { player } = await renderPlayingHls();
        player.emit('hlsError', { fatal: true, type: 'mediaError' });
        player.emit('hlsError', { fatal: true, type: 'mediaError' });
        expect(screen.getByText('Unable to load video')).toBeVisible();
      });
    });

    describe('fatal playlist error', () => {
      const PLAYLIST_ERRORS = [
        { name: 'a missing playlist', response: { code: 404 }, message: 'This video segment has not uploaded yet or has been deleted.' },
        { name: 'a denied playlist', response: { code: 403 }, message: 'Unable to load video' },
        { name: 'no network', response: undefined, message: 'Unable to load video. Check network connection.' },
      ];

      async function renderFailedHls(response) {
        const view = await renderHls();
        view.player.emit('hlsError', { fatal: true, type: 'networkError', response });
        return view;
      }

      it.each(PLAYLIST_ERRORS)('shows $name with a retry button', async ({ response, message }) => {
        await renderFailedHls(response);
        expect(screen.getByText(message)).toBeVisible();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
      });

      it('keeps the clock running and retries with a new player at the clock position', async () => {
        const { video, player } = await renderFailedHls({ code: 404 });
        fireEvent.pause(video);
        advance(ROUTE_DURATION_MS + 1000);
        expect(currentOffset()).toBe(1000);
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await vi.waitFor(() => expect(hls.instances).toHaveLength(2));
        expect(player.destroy).toHaveBeenCalled();
        expect(hls.instances[1].config.startPosition).toBe(1);
        hls.instances[1].emit('hlsMediaAttached');
        expect(video.play).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('hls.js that cannot be imported', () => {
    beforeEach(() => {
      vi.stubGlobal('MediaSource', class {});
      vi.doMock('hls.js/light', () => {
        throw new Error('Failed to fetch dynamically imported module');
      });
    });

    afterEach(() => {
      vi.doMock('hls.js/light', () => ({ default: hls.Hls }));
    });

    it('shows a network error', async () => {
      renderVideo();
      await vi.waitFor(() => expect(screen.getByText('Unable to load video. Check network connection.')).toBeVisible());
    });

    it('shows nothing when the component unmounts first', async () => {
      renderVideo().unmount();
      await act(() => import('hls.js/light').catch(() => {}));
      expect(screen.queryByText(/Unable to load video/)).not.toBeInTheDocument();
    });
  });
});
