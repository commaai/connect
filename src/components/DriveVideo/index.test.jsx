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

const hls = vi.hoisted(() => ({
  instances: [],
  Hls: class Hls {
    static Events = { ERROR: 'hlsError', BUFFER_CODECS: 'hlsBufferCodecs', MEDIA_ATTACHED: 'hlsMediaAttached' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };

    constructor(config) {
      Object.assign(this, { config, handlers: {}, attachMedia: vi.fn(), destroy: vi.fn(), loadSource: vi.fn(), recoverMediaError: vi.fn() });
      hls.instances.push(this);
    }

    on(event, handler) { this.handlers[event] = handler; }

    emit(event, data) { act(() => this.handlers[event](event, data)); }
  },
}));
vi.mock('hls.js/light', () => ({ default: hls.Hls }));

function loadRoutes(logs) {
  const routes = logs.map((log) => ({ fullname: `${DONGLE}|${log}`, log_id: log, duration: 60000, segment_numbers: [0], start_time_utc_millis: 0 }));
  store.dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId: DONGLE, start: 0, end: 1, routes });
}

function setMedia(video, props) {
  Object.entries(props).forEach(([key, value]) => Object.defineProperty(video, key, { value, writable: true, configurable: true }));
}

// a write to currentTime clears ended, like in a browser
function renderVideo(props = {}, duration = 60) {
  const view = render(<Provider store={store}><DriveVideo isMuted {...props} /></Provider>);
  const video = document.querySelector('video');
  const writes = [];
  let time = 0;
  setMedia(video, { readyState: 1, duration, ended: false });
  Object.defineProperty(video, 'currentTime', { configurable: true, get: () => time, set: (t) => {
    expect(t).toBeLessThan(duration);
    writes.push(t);
    time = t;
    video.ended = false;
  } });
  const playToEnd = () => {
    time = duration;
    video.ended = true;
    fireEvent.pause(video);
    fireEvent.ended(video);
  };
  return { ...view, video, writes, playToEnd };
}

async function renderHls(props) {
  vi.stubGlobal('MediaSource', class {});
  const view = renderVideo(props);
  view.video.readyState = 0;
  await vi.waitFor(() => expect(hls.instances).toHaveLength(1));
  return { ...view, player: hls.instances[0] };
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
    vi.doMock('hls.js/light', () => ({ default: hls.Hls }));
    hls.instances = [];
  });

  it('writes to the video only for commands and follows a system pause and play', () => {
    const setRate = vi.spyOn(HTMLMediaElement.prototype, 'playbackRate', 'set');
    const { video, writes } = renderVideo();
    setMedia(video, { paused: false });
    fireEvent.timeUpdate(video);
    expect(writes).toEqual([]);
    expect(setRate).not.toHaveBeenCalled();

    act(() => store.dispatch(seek(6000)));
    expect(writes).toEqual([6]);
    act(() => store.dispatch(play(2)));
    expect(video.playbackRate).toBe(2);
    act(() => store.dispatch(pause()));
    expect(video.pause).toHaveBeenCalledTimes(1);
    fireEvent.play(video);
    expect(store.getState().desiredPlaySpeed).toBe(2);
    fireEvent.pause(video);
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('holds the clock until the routes load', () => {
    act(() => {
      loadRoutes([]);
      store.dispatch(pushTimelineRange(LOG, null, null, false));
    });
    vi.advanceTimersByTime(3000);
    expect(currentOffset()).toBe(0);
  });

  it.each([
    ['inside the video', 4000, 4, 4000], ['past its end', 40000, 29.5, 41000],
  ])('applies a seek made before metadata loads, %s', (_name, offset, time, later) => {
    const { video } = renderVideo({}, 30);
    video.readyState = 0;
    act(() => store.dispatch(seek(offset)));
    act(() => vi.advanceTimersByTime(1000));
    expect(currentOffset()).toBe(offset);

    video.readyState = 1;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(time);
    act(() => vi.advanceTimersByTime(1000));
    expect(currentOffset()).toBe(later);
  });

  it('offsets video time by the first camera frame', () => {
    const firstFrame = { type: 'event', route_offset_millis: 2000, data: { event_type: 'first_road_camera_frame' } };
    act(() => { store.dispatch({ type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: `${DONGLE}|${LOG}`, events: [firstFrame] }); });
    const { writes } = renderVideo();
    act(() => store.dispatch(seek(6000)));
    expect(writes).toEqual([4]);
    expect(currentOffset()).toBe(6000);
  });

  it('starts a fresh video on route change and ignores the old one', async () => {
    let refuse;
    HTMLMediaElement.prototype.play.mockReturnValueOnce(new Promise((_resolve, reject) => { refuse = reject; }));
    const { video, writes } = renderVideo();
    act(() => store.dispatch(pushTimelineRange(OTHER_LOG, 0, 60000, false)));
    expect(writes).toEqual([]);
    expect(document.querySelector('video')).not.toBe(video);
    expect(document.querySelector('video').src).toContain(OTHER_LOG);
    await act(async () => refuse(Object.assign(new Error('denied'), { name: 'NotAllowedError' })));
    expect(store.getState().desiredPlaySpeed).toBe(1);
  });

  it.each([
    ['NotAllowedError', 0], ['AbortError', 1],
  ])('play() rejected with %s', async (name, speed) => {
    HTMLMediaElement.prototype.play.mockRejectedValueOnce(Object.assign(new Error('denied'), { name }));
    renderVideo();
    await act(async () => {});
    act(() => vi.advanceTimersByTime(300));
    expect(store.getState().desiredPlaySpeed).toBe(speed);
    expect(screen.queryAllByRole('progressbar')).toHaveLength(speed);
  });

  it('wraps the loop and restarts it when the video ends', () => {
    store.dispatch(selectLoop(10000, 20000));
    const { video, playToEnd } = renderVideo();
    setMedia(video, { paused: false });
    video.currentTime = 21;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toBe(10);
    act(() => store.dispatch(seek(25000)));
    expect(video.currentTime).toBe(20);
    act(() => { store.dispatch(selectLoop(10000, 60000)); });
    video.play.mockClear();
    playToEnd();
    act(() => vi.advanceTimersByTime(0));
    expect(video.currentTime).toBe(10);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('keeps the clock running past the end of a partial video', () => {
    const { video, playToEnd } = renderVideo({}, 30);
    playToEnd();
    act(() => vi.advanceTimersByTime(20000));
    video.currentTime = 0;
    fireEvent.play(video);
    expect(video.currentTime).toBe(29.5);
    expect(currentOffset()).toBe(50000);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    act(() => store.dispatch(seek(40000)));
    video.play.mockClear();
    act(() => store.dispatch(play(2)));
    expect(video.play).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(10000));
    expect(video.currentTime).toBe(0);
    expect(video.play).toHaveBeenCalledTimes(1);

    act(() => store.dispatch(pushTimelineRange(LOG, 40000, 50000, false)));
    act(() => vi.advanceTimersByTime(12000));
    expect(currentOffset()).toBe(42000);
  });

  it.each([
    ['a seek plays', 1, seek(10000)],
    ['a seek shows the paused frame', 0, seek(10000)],
    ['a new range plays', 1, pushTimelineRange(LOG, 10000, 20000, false)],
  ])('%s when seeking back from past the end', (_name, plays, action) => {
    const { video } = renderVideo({}, 30);
    if (!plays) act(() => store.dispatch(pause()));
    act(() => store.dispatch(seek(40000)));
    expect(video.currentTime).toBe(29.5);
    video.play.mockClear();
    act(() => store.dispatch(action));
    expect(currentOffset()).toBe(10000);
    expect(video.play).toHaveBeenCalledTimes(plays);
  });

  it('restarts at once when the video ends past the end of the route', () => {
    const { video, playToEnd } = renderVideo({}, 65);
    video.play.mockClear();
    playToEnd();
    act(() => vi.advanceTimersByTime(1000));
    expect(video.currentTime).toBe(0);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('shows the spinner after a short delay', () => {
    const { video } = renderVideo();
    fireEvent.playing(video);
    fireEvent.waiting(video);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole('progressbar')).toBeVisible();
    fireEvent.playing(video);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    fireEvent.waiting(video);
    act(() => vi.advanceTimersByTime(300));
    Object.assign(video, { readyState: 2, currentTime: 1 });
    fireEvent.timeUpdate(video);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it.each([
    [2, 'Unable to load video. Check network connection.'], [3, 'Unable to load video'],
  ])('shows native error %s with retry and reports no audio', (code, message) => {
    const onAudioStatusChange = vi.fn();
    const { video } = renderVideo({ onAudioStatusChange });
    setMedia(video, { error: { code }, audioTracks: { length: 0 } });
    fireEvent.loadedData(video);
    expect(onAudioStatusChange).toHaveBeenCalledWith(false);
    fireEvent.error(video);
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it.each([
    ['loads', false], ['fails to load', true],
  ])('ignores hls.js when it %s after unmount', async (_name, fails) => {
    vi.stubGlobal('MediaSource', class {});
    if (fails) vi.doMock('hls.js/light', () => { throw new Error('Failed to fetch dynamically imported module'); });
    renderVideo().unmount();
    await act(() => import('hls.js/light').catch(() => {}));
    expect(hls.instances).toHaveLength(0);
  });

  it('shows a network error when hls.js fails to load', async () => {
    vi.stubGlobal('MediaSource', class {});
    vi.doMock('hls.js/light', () => { throw new Error('Failed to fetch dynamically imported module'); });
    renderVideo();
    await vi.waitFor(() => expect(screen.getByText('Unable to load video. Check network connection.')).toBeVisible());
  });

  it('plays through hls.js, reports audio and recovers once from a fatal media error', async () => {
    const onAudioStatusChange = vi.fn();
    const { video, player } = await renderHls({ onAudioStatusChange });
    expect(player.attachMedia).toHaveBeenCalledWith(video);
    player.emit('hlsBufferCodecs', { video: {} });
    expect(onAudioStatusChange).not.toHaveBeenCalled();
    player.emit('hlsBufferCodecs', { audio: {}, video: {} });
    expect(onAudioStatusChange).toHaveBeenCalledWith(true);
    player.emit('hlsMediaAttached');
    Object.assign(video, { readyState: 1, currentTime: 12 });
    player.emit('hlsError', { fatal: false, type: 'networkError' });
    player.emit('hlsError', { fatal: true, type: 'mediaError' });
    video.readyState = 0;
    expect(currentOffset()).toBe(12000);
    expect(player.recoverMediaError).toHaveBeenCalledTimes(1);
    player.emit('hlsMediaAttached');
    expect(video.play).toHaveBeenCalledTimes(2);
    Object.assign(video, { readyState: 1, currentTime: 0 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(12);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

    player.emit('hlsError', { fatal: true, type: 'mediaError' });
    expect(screen.getByText('Unable to load video')).toBeVisible();
  });

  it.each([
    ['a missing playlist', { code: 404 }, 'This video segment has not uploaded yet or has been deleted.'],
    ['a denied playlist', { code: 403 }, 'Unable to load video'],
    ['no network', undefined, 'Unable to load video. Check network connection.'],
  ])('shows %s, keeps the clock running and retries', async (_name, response, message) => {
    const { video, player } = await renderHls();
    player.emit('hlsError', { fatal: true, type: 'networkError', response });
    expect(screen.getByText(message)).toBeVisible();
    fireEvent.pause(video);
    act(() => vi.advanceTimersByTime(61000));
    expect(currentOffset()).toBe(1000);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await vi.waitFor(() => expect(hls.instances).toHaveLength(2));
    expect(player.destroy).toHaveBeenCalled();
    expect(hls.instances[1].config.startPosition).toBe(1);
    hls.instances[1].emit('hlsMediaAttached');
    expect(video.play).toHaveBeenCalledTimes(1);
  });
});
