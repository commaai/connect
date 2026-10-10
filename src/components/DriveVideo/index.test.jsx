import * as Redux from 'redux';
import thunk from 'redux-thunk';
import { act, fireEvent, render, screen } from '@testing-library/react';

import DriveVideo from '.';
import rootReducer from '../../reducers';
import initialState from '../../initialState';
import { pause, seek, selectLoop, setPlaybackSpeed, videoProgress } from '../../timeline/playback';

const hls = vi.hoisted(() => ({
  startLoad: vi.fn(),
  on(event, handler) { this[event] = handler; },
  loadSource() {}, attachMedia() {}, stopLoad() {}, destroy() {},
}));
vi.mock('hls.js/light', () => ({ default: class { static Events = { ERROR: 'hlsError', BUFFER_CODECS: 'hlsBufferCodecs' }; constructor() { return hls; } } }));
vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });

function set(video, props) {
  Object.entries(props).forEach(([key, value]) => Object.defineProperty(video, key, { value, configurable: true }));
}

function renderVideo(state, props) {
  const store = Redux.createStore(rootReducer, { ...initialState, currentRoute: { videoStartOffset: 2000 }, ...state }, Redux.applyMiddleware(thunk));
  const video = render(<DriveVideo store={store} {...props} />).container.querySelector('video');
  set(video, { readyState: video.HAVE_ENOUGH_DATA, paused: false, play: vi.fn(async () => {}), pause: vi.fn() });
  return { store, video };
}

describe('drive video', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('syncs seek, pause, speed and mute between the store and the video', () => {
    const onMuteChange = vi.fn();
    const { store, video } = renderVideo({}, { isMuted: true, onMuteChange });
    // progress reported before the render must not cancel the seek
    act(() => { store.dispatch(seek(80000)); store.dispatch(videoProgress(3000)); });
    expect(video.currentTime).toEqual(78);
    act(() => store.dispatch(pause()));
    expect(video.pause).toHaveBeenCalledTimes(1);
    fireEvent.play(video);
    expect(store.getState().isPlaying).toEqual(true);
    set(video, { paused: true });
    fireEvent.pause(video);
    act(() => store.dispatch(setPlaybackSpeed(2)));
    expect(video.pause).toHaveBeenCalledTimes(1); // not again once the video is paused
    expect(video).toMatchObject({ playbackRate: 2, defaultPlaybackRate: 2 });
    video.currentTime = 30;
    act(() => { video.playbackRate = 1.5; video.muted = false; });
    fireEvent.seeking(video);
    expect(store.getState()).toMatchObject({ offset: 32000, isPlaying: false, desiredPlaySpeed: 1.5 });
    expect(onMuteChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('loops the selection', () => {
    const { store, video } = renderVideo({ loop: { startTime: 5000, duration: 2000 } });
    video.currentTime = 5.5;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toEqual(3);
    video.currentTime = 6;
    set(video, { duration: 6, paused: true, ended: true });
    fireEvent.pause(video); // the browser pauses at the end before it fires ended
    fireEvent.ended(video);
    expect(video.currentTime).toEqual(3);
    expect(store.getState().isPlaying).toEqual(true);
    expect(video.play).toHaveBeenCalledTimes(1);
    set(video, { duration: 2 }); // the selection starts after the end of the uploaded video
    fireEvent.ended(video);
    expect(store.getState().isPlaying).toEqual(false);
  });

  it('pauses on a selection with no video', () => {
    const { store, video } = renderVideo({ loop: { startTime: 0, duration: 1000 } });
    fireEvent.timeUpdate(video);
    expect(screen.getByText(/not uploaded yet/)).toBeInTheDocument();
    act(() => store.dispatch(selectLoop(500, 1500)));
    expect(screen.getByText(/not uploaded yet/)).toBeInTheDocument();
    expect(store.getState().isPlaying).toEqual(false);
    act(() => store.dispatch(selectLoop(3000, 5000)));
    expect(screen.queryByText(/not uploaded yet/)).toBeNull();
    expect(video.currentTime).toEqual(1);
    expect(store.getState().isPlaying).toEqual(true);
  });

  it('tracks every frame and recovers from a stall or an error', () => {
    const { store, video } = renderVideo({ loop: { startTime: 5000, duration: 2000 } });
    fireEvent.play(video);
    fireEvent.canPlay(video);
    video.currentTime = 4;
    act(() => vi.advanceTimersToNextFrame());
    expect(store.getState().offset).toEqual(6000);
    video.currentTime = 5.5;
    act(() => vi.advanceTimersToNextFrame());
    expect(video.currentTime).toEqual(3);
    expect(screen.queryByRole('progressbar')).toBeNull();
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Retry')).toBeNull();
    act(() => vi.advanceTimersByTime(30000));
    fireEvent.click(screen.getByText('Retry'));
    expect(screen.queryByText('Retry')).toBeNull();

    set(video, { error: { code: 2 } });
    fireEvent.error(video);
    expect(screen.getByText('Unable to load video')).toBeInTheDocument();
    act(() => store.dispatch(seek(6000)));
    expect(screen.queryByText('Unable to load video')).toBeNull();
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toEqual(4);
    fireEvent.error(video);
    fireEvent(window, new Event('online'));
    expect(screen.queryByText('Unable to load video')).toBeNull();
  });

  it('skips a missing segment', async () => {
    vi.stubGlobal('MediaSource', class {});
    const { video } = renderVideo();
    await act(async () => {});
    set(video, { readyState: video.HAVE_METADATA });
    act(() => hls.hlsError('hlsError', { details: 'fragLoadError', response: { code: 404 }, frag: { start: 0, end: 60 } }));
    expect(video.currentTime).toEqual(60.3);
    expect(hls.startLoad).toHaveBeenCalledWith(60.3);
    // a 404 ahead of the playhead is skipped when playback reaches it
    act(() => hls.hlsError('hlsError', { details: 'fragLoadError', response: { code: 404 }, frag: { start: 120, end: 180 } }));
    expect(video.currentTime).toEqual(60.3);
    video.currentTime = 119.5;
    fireEvent.waiting(video);
    expect(video.currentTime).toEqual(180.3);
  });
});
