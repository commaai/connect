import React from 'react';
import * as Redux from 'redux';
import thunk from 'redux-thunk';
import { act, fireEvent, render, screen } from '@testing-library/react';

import DriveVideo from '.';
import * as Types from '../../actions/types';
import rootReducer from '../../reducers';
import { createInitialState } from '../../initialState';
import { pause, seek, selectLoop, setPlaybackSpeed, videoProgress } from '../../timeline/playback';

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: () => 'https://video.example.com/qcamera.m3u8' } },
}));

const currentRoute = { fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00', videoStartOffset: 2000 };

function renderVideo(state = {}, props = {}) {
  const store = Redux.createStore(
    rootReducer,
    { ...createInitialState('/'), currentRoute, ...state },
    Redux.applyMiddleware(thunk),
  );
  const { container } = render(<DriveVideo store={store} {...props} />);
  const video = container.querySelector('video');
  Object.defineProperty(video, 'readyState', { value: video.HAVE_ENOUGH_DATA });
  return { store, video };
}

describe('drive video', () => {
  beforeAll(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockReturnValue();
  });
  afterAll(() => vi.restoreAllMocks());

  it('follows a pause and play from the browser', () => {
    const { store, video } = renderVideo();
    const videoPause = vi.spyOn(video, 'pause');
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    fireEvent.pause(video);
    expect(store.getState().isPlaying).toEqual(false);
    expect(videoPause).not.toHaveBeenCalled();

    Object.defineProperty(video, 'paused', { value: false });
    fireEvent.play(video);
    expect(store.getState().isPlaying).toEqual(true);
  });

  it('follows the speed and pause controls', () => {
    const { store, video } = renderVideo();
    act(() => store.dispatch(setPlaybackSpeed(2)));
    expect(video.playbackRate).toEqual(2);
    const videoPause = vi.spyOn(video, 'pause');
    Object.defineProperty(video, 'paused', { value: false });
    act(() => store.dispatch(pause()));
    expect(videoPause).toHaveBeenCalled();
  });

  it('follows a speed change from the browser', () => {
    const { store, video } = renderVideo();
    video.playbackRate = 1.5;
    fireEvent.rateChange(video);
    expect(store.getState().desiredPlaySpeed).toEqual(1.5);
  });

  it('follows a mute from the browser', () => {
    const onMuteChange = vi.fn();
    const { video } = renderVideo({}, { isMuted: true, onMuteChange });
    fireEvent.volumeChange(video);
    expect(onMuteChange).not.toHaveBeenCalled();
    video.muted = false;
    fireEvent.volumeChange(video);
    expect(onMuteChange).toHaveBeenCalledWith(false);
  });

  it('keeps its own speed change while paused', () => {
    const { store, video } = renderVideo({ isPlaying: false });
    act(() => store.dispatch(setPlaybackSpeed(2)));
    act(() => store.dispatch(setPlaybackSpeed(4)));
    fireEvent.rateChange(video);
    fireEvent.rateChange(video);
    expect(store.getState().desiredPlaySpeed).toEqual(4);
    expect(video.defaultPlaybackRate).toEqual(4);
  });

  it('does not re-render on progress', () => {
    let renders = 0;
    const store = Redux.createStore(rootReducer, { ...createInitialState('/'), currentRoute }, Redux.applyMiddleware(thunk));
    render(<React.Profiler id="video" onRender={() => { renders += 1; }}><DriveVideo store={store} /></React.Profiler>);
    const before = renders;
    act(() => store.dispatch(videoProgress(5000)));
    expect(renders).toEqual(before);
  });

  it('seeks even if progress is reported before the render', () => {
    const { store, video } = renderVideo();
    act(() => {
      store.dispatch(seek(80000));
      store.dispatch(videoProgress(3000));
    });
    expect(video.currentTime).toEqual(78);
  });

  it('retries at a seek after an error', () => {
    const { store, video } = renderVideo();
    Object.defineProperty(video, 'error', { value: { code: 2 } });
    fireEvent.error(video);
    expect(screen.getByText('Unable to load video')).toBeInTheDocument();

    act(() => store.dispatch(seek(12000)));
    expect(screen.queryByText('Unable to load video')).toBeNull();
    expect(video.currentTime).toEqual(0);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toEqual(10);
  });

  it('jumps back to the loop start at the end of the loop', () => {
    const { video } = renderVideo({ loop: { startTime: 5000, duration: 2000 } });
    video.currentTime = 5.5;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toEqual(3);
  });

  it('restarts the loop when the video ends', () => {
    const { store, video } = renderVideo({ loop: { startTime: 5000, duration: 2000 } });
    Object.defineProperty(video, 'duration', { value: 6, configurable: true });
    // at the end the browser pauses the video, then fires ended
    Object.defineProperty(video, 'paused', { value: true });
    Object.defineProperty(video, 'ended', { value: true });
    fireEvent.pause(video);
    fireEvent.ended(video);
    expect(video.currentTime).toEqual(3);
    expect(store.getState().isPlaying).toEqual(true);

    // the selection starts after the end of the uploaded video
    Object.defineProperty(video, 'duration', { value: 2 });
    fireEvent.ended(video);
    expect(store.getState().isPlaying).toEqual(false);
  });

  it('pauses on a selection with no video', () => {
    const { store, video } = renderVideo({ loop: { startTime: 0, duration: 1000 } });
    const message = 'This video segment has not uploaded yet or has been deleted.';
    fireEvent.timeUpdate(video);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(store.getState().isPlaying).toEqual(false);

    act(() => store.dispatch(selectLoop(3000, 5000)));
    expect(screen.queryByText(message)).toBeNull();
    expect(video.currentTime).toEqual(1);
    expect(store.getState().isPlaying).toEqual(true);
  });

  it('reseeks when route events move the first frame', () => {
    const { store, video } = renderVideo();
    video.currentTime = 5;
    fireEvent.timeUpdate(video);
    act(() => store.dispatch({
      type: Types.ACTION_UPDATE_ROUTE_EVENTS,
      fullname: currentRoute.fullname,
      events: [{ type: 'event', route_offset_millis: 3000, data: { event_type: 'first_road_camera_frame' } }],
    }));
    expect(video.currentTime).toEqual(4);
  });

  it('tracks every frame and shows Retry on a stall', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      const { store, video } = renderVideo();
      Object.defineProperty(video, 'paused', { value: false });
      fireEvent.canPlay(video);
      video.currentTime = 5;
      act(() => vi.advanceTimersToNextFrame());
      expect(store.getState().offset).toEqual(7000);
      expect(screen.queryByRole('progressbar')).toBeNull();

      act(() => vi.advanceTimersByTime(31000));
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Retry'));
      expect(screen.queryByText('Retry')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
