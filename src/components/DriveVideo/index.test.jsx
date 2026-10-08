import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createStore, applyMiddleware } from 'redux';
import { DriveVideo } from '.';
import { reducer, play, pause, seek, selectLoop } from '../../timeline/playback';
import { mediaMiddleware } from '../../timeline/media';
import { currentOffset } from '../../timeline';

vi.mock('react-player/file', () => ({ default: React.forwardRef((props, ref) => {
  React.useImperativeHandle(ref, () => ({ getInternalPlayer: key => key === 'hls' ? window.testHls : window.testVideo }));
  window.playerProps = props;
  return <div data-testid="player" />;
}) }));

let store;
let view;
let video;
let unsubscribe;
function mount({ offset = 0, videoOffset = 0, speed = 1, readyState = 4 } = {}) {
  video = new EventTarget();
  Object.assign(video, {
    currentTime: 0, duration: 60, readyState, paused: true, ended: false, seeking: false,
    playbackRate: 1, audioTracks: { length: 1 },
    play: vi.fn(() => { video.paused = false; return Promise.resolve(); }),
    pause: vi.fn(() => { video.paused = true; }),
  });
  window.testVideo = video;
  window.testHls = null;
  const transportReducer = (state, action) => reducer(action.type === 'CHANGE_SOURCE' ? { ...state, currentRoute: action.route } : state, action);
  store = createStore(transportReducer, {
    currentRoute: { fullname: 'device|drive', duration: 65000, videoStartOffset: videoOffset },
    desiredPlaySpeed: speed, offset, startTime: Date.now(),
    loop: { startTime: 0, duration: 65000 },
  }, applyMiddleware(mediaMiddleware));
  const props = () => ({ playback: store.getState(), dispatch: store.dispatch, isMuted: true, onAudioStatusChange: vi.fn() });
  view = render(<DriveVideo {...props()} />);
  unsubscribe = store.subscribe(() => {
    // The keyed outer component disposes this instance on route removal.
    if (store.getState().currentRoute) view.rerender(<DriveVideo {...props()} />);
  });
  act(() => window.playerProps.onReady());
}
afterEach(() => { unsubscribe?.(); view?.unmount(); delete window.testVideo; delete window.testHls; delete window.playerProps; });

describe('media transport', () => {
  it('uses actual media time with no wall-clock drift or rate correction', () => {
    mount({ videoOffset: 2000 });
    video.currentTime = 12.25;
    act(() => video.dispatchEvent(new Event('timeupdate')));
    expect(currentOffset(store.getState())).toBe(14250);
    const oldNow = Date.now;
    Date.now = () => oldNow() + 20000;
    expect(currentOffset(store.getState())).toBe(14250);
    Date.now = oldNow;
    expect(video.playbackRate).toBe(1);
  });

  it('runs play, pause, and rapid seeks synchronously, without setting rate zero', () => {
    mount();
    act(() => store.dispatch(pause()));
    expect(video.paused).toBe(true);
    expect(video.playbackRate).toBe(1);
    act(() => { store.dispatch(seek(21000)); store.dispatch(seek(3500)); });
    expect(video.currentTime).toBe(3.5);
    expect(currentOffset(store.getState())).toBe(3500);
    act(() => store.dispatch(play(2)));
    expect(video.paused).toBe(false);
    expect(video.playbackRate).toBe(2);
  });

  it('keeps the latest seek while metadata loads, and clears buffering while paused', () => {
    mount({ readyState: 0, speed: 0 });
    act(() => { store.dispatch(seek(10000)); store.dispatch(seek(20000)); });
    expect(video.currentTime).toBe(0);
    video.readyState = 2;
    act(() => video.dispatchEvent(new Event('loadedmetadata')));
    act(() => video.dispatchEvent(new Event('canplay')));
    expect(video.currentTime).toBe(20);
    expect(store.getState().isBufferingVideo).toBe(false);
    expect(video.play).not.toHaveBeenCalled();
  });

  it('does not accept time from an unfinished seek', () => {
    mount();
    video.seeking = true;
    act(() => store.dispatch(seek(10000)));
    video.currentTime = 1;
    act(() => video.dispatchEvent(new Event('timeupdate')));
    expect(currentOffset(store.getState())).toBe(10000);
    video.seeking = false;
    act(() => video.dispatchEvent(new Event('seeked')));
    expect(video.currentTime).toBe(10);
    expect(currentOffset(store.getState())).toBe(10000);
  });

  it('loops from zero and restarts a completed file', () => {
    mount();
    act(() => store.dispatch(selectLoop(0, 10000)));
    video.currentTime = 10;
    video.ended = true;
    video.paused = true;
    act(() => video.dispatchEvent(new Event('ended')));
    expect(video.currentTime).toBe(0);
    expect(currentOffset(store.getState())).toBe(0);
  });

  it('does not pause the transport on buffering or obscure transient HLS errors', () => {
    mount();
    act(() => video.dispatchEvent(new Event('waiting')));
    expect(store.getState().isBufferingVideo).toBe(true);
    expect(video.paused).toBe(false);
    act(() => window.playerProps.onError('hlsError', { fatal: false, type: 'networkError' }));
    expect(screen.queryByText('Retry video')).not.toBeInTheDocument();
    act(() => video.dispatchEvent(new Event('canplay')));
    expect(store.getState().isBufferingVideo).toBe(false);
  });

  it('bounds fatal HLS recovery and offers a source reload on failure', () => {
    mount();
    const hls = { startLoad: vi.fn(), recoverMediaError: vi.fn() };
    window.testHls = hls;
    act(() => window.playerProps.onError('hlsError', { fatal: true, type: 'mediaError' }));
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    act(() => window.playerProps.onError('hlsError', { fatal: true, type: 'mediaError' }));
    expect(screen.getByText('Retry video')).toBeInTheDocument();
    act(() => fireEvent.click(screen.getByText('Retry video')));
    expect(screen.queryByText('Retry video')).not.toBeInTheDocument();
  });

  it('offers a user-initiated play action when autoplay is denied', async () => {
    mount({ speed: 0 });
    video.play.mockRejectedValueOnce(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    await act(async () => store.dispatch(play()));
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(screen.getByText('Play video')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByText('Play video')));
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(store.getState().desiredPlaySpeed).toBe(1);
  });

  it('ignores stale play rejections and removes native listeners after unmount', async () => {
    mount({ speed: 0 });
    let reject;
    video.play.mockImplementation(() => new Promise((resolve, rejection) => { reject = rejection; }));
    act(() => store.dispatch(play()));
    unsubscribe();
    view.unmount();
    await act(async () => reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
    expect(store.getState().desiredPlaySpeed).toBe(1);
    expect(store.getState().mediaRoute).toBe(null);
    const offset = store.getState().offset;
    video.currentTime = 20;
    act(() => video.dispatchEvent(new Event('timeupdate')));
    expect(store.getState().offset).toBe(offset);
  });
  it('ignores a rejected play request superseded by pause/resume', async () => {
    mount({ speed: 0 });
    let reject;
    video.play.mockImplementationOnce(() => new Promise((resolve, rejection) => { reject = rejection; }));
    act(() => { store.dispatch(play()); store.dispatch(pause()); store.dispatch(play(2)); });
    await act(async () => reject(Object.assign(new Error('old request'), { name: 'NotAllowedError' })));
    expect(screen.queryByText('Play video')).not.toBeInTheDocument();
    expect(store.getState().desiredPlaySpeed).toBe(2);
  });

  it('reflects a native OS pause without advancing the clock', () => {
    mount();
    video.currentTime = 3;
    video.paused = true;
    act(() => video.dispatchEvent(new Event('pause')));
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(currentOffset(store.getState())).toBe(3000);
  });

  it('rejects progress from another route', () => {
    mount();
    act(() => store.dispatch({ type: 'ACTION_MEDIA_TIME', route: 'device|old', offset: 12000 }));
    expect(currentOffset(store.getState())).toBe(0);
  });

  it('handles a selection beyond the available video without an endless seek', () => {
    mount({ speed: 0 });
    act(() => store.dispatch(selectLoop(61000, 65000)));
    expect(screen.getByText('No video is available in this selected range.')).toBeInTheDocument();
    expect(store.getState().isBufferingVideo).toBe(false);
    act(() => store.dispatch(selectLoop(0, 5000)));
    expect(screen.queryByText('No video is available in this selected range.')).not.toBeInTheDocument();
  });

  it('resumes from the selection start when play is requested at its end', () => {
    mount({ speed: 0 });
    act(() => { store.dispatch(selectLoop(10000, 20000)); store.dispatch(seek(20000)); });
    act(() => store.dispatch(play()));
    expect(video.currentTime).toBe(10);
    expect(currentOffset(store.getState())).toBe(10000);
  });

  it('ignores transport commands after selection changes before React disposal', () => {
    mount();
    act(() => {
      store.dispatch({ type: 'CHANGE_SOURCE', route: null });
      store.dispatch(pause());
    });
    expect(video.paused).toBe(true);
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

});
