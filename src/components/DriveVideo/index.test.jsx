import React from 'react';
import { Provider } from 'react-redux';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import DriveVideo from '.';
import store from '../../store';
import * as Types from '../../actions/types';
import { currentOffset } from '../../timeline';
import { pause, play, resetPlayback, seek, selectLoop } from '../../timeline/playback';

const hlsInstances = vi.hoisted(() => []);

vi.mock('hls.js', () => {
  class Hls {
    static isSupported() { return true; }

    constructor() {
      this.handlers = {};
      this.destroy = vi.fn();
      this.loadSource = vi.fn();
      this.attachMedia = vi.fn();
      this.recoverMediaError = vi.fn();
      hlsInstances.push(this);
    }

    on(event, handler) {
      this.handlers[event] = handler;
    }
  }
  Hls.Events = { ERROR: 'hlsError', BUFFER_CODECS: 'hlsBufferCodecs' };
  Hls.ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
  return { default: Hls };
});

const ROUTE = { fullname: 'a2a0ccea32023010|2023-07-27--13-01-19', log_id: '2023-07-27--13-01-19', duration: 60000 };

// jsdom has no media pipeline, so the test drives the element state itself
function fakeMedia(video) {
  const media = { readyState: 0, currentTime: 0, paused: true, ended: false, playbackRate: 1 };
  Object.keys(media).forEach((key) => {
    Object.defineProperty(video, key, {
      configurable: true,
      get: () => media[key],
      set: (value) => { media[key] = value; },
    });
  });
  return media;
}

async function renderVideo() {
  const view = render(
    <Provider store={store}>
      <DriveVideo isMuted />
    </Provider>,
  );
  const video = view.container.querySelector('video');
  const media = fakeMedia(video);
  await waitFor(() => expect(hlsInstances).toHaveLength(1));
  return { ...view, video, media };
}

function loadMetadata(video, media) {
  media.readyState = HTMLMediaElement.HAVE_METADATA;
  fireEvent(video, new Event('loadedmetadata'));
}

describe('DriveVideo', () => {
  beforeEach(() => {
    hlsInstances.length = 0;
    HTMLMediaElement.prototype.play.mockClear();
    HTMLMediaElement.prototype.pause.mockClear();
    store.dispatch({ type: Types.ACTION_ROUTES_METADATA, routes: [ROUTE], dongleId: 'a2a0ccea32023010' });
    store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: ROUTE.log_id });
    store.dispatch(resetPlayback());
    store.dispatch(pause());
  });

  it('drives the playback offset from the video', async () => {
    const { video, media } = await renderVideo();
    act(() => { store.dispatch(seek(5000)); });
    expect(currentOffset()).toEqual(5000);

    loadMetadata(video, media);
    expect(media.currentTime).toEqual(5);

    media.currentTime = 12.5;
    expect(currentOffset()).toEqual(12500);
  });

  it('seeks the video once, but not when pausing at the current position', async () => {
    const { video, media } = await renderVideo();
    loadMetadata(video, media);

    act(() => { store.dispatch(seek(30000)); });
    expect(media.currentTime).toEqual(30);

    const seekSpy = vi.fn();
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 30, set: seekSpy });
    act(() => { store.dispatch(play()); });
    act(() => { store.dispatch(pause()); });
    expect(seekSpy).not.toHaveBeenCalled();
  });

  it('applies play speed and pause to the video', async () => {
    const { video, media } = await renderVideo();
    loadMetadata(video, media);

    act(() => { store.dispatch(play(2)); });
    expect(media.playbackRate).toEqual(2);
    expect(video.play).toHaveBeenCalled();

    act(() => { store.dispatch(pause()); });
    expect(video.pause).toHaveBeenCalled();
  });

  it('follows a pause from outside the app', async () => {
    const { video, media } = await renderVideo();
    loadMetadata(video, media);
    act(() => { store.dispatch(play()); });

    media.paused = true;
    media.ended = true;
    fireEvent(video, new Event('pause'));
    expect(store.getState().desiredPlaySpeed).toEqual(1);

    media.ended = false;
    fireEvent(video, new Event('pause'));
    expect(store.getState().desiredPlaySpeed).toEqual(0);
  });

  it('shows the play button when autoplay is blocked', async () => {
    const { video, media } = await renderVideo();
    HTMLMediaElement.prototype.play.mockRejectedValueOnce(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    act(() => { store.dispatch(play()); });
    loadMetadata(video, media);

    await waitFor(() => expect(store.getState().desiredPlaySpeed).toEqual(0));
  });

  it('wraps playback at the end of the loop', async () => {
    const { video, media } = await renderVideo();
    loadMetadata(video, media);
    act(() => { store.dispatch(selectLoop(10000, 20000)); });
    expect(media.currentTime).toEqual(10);

    media.currentTime = 21;
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 1000);
    fireEvent(video, new Event('timeupdate'));
    vi.restoreAllMocks();

    expect(media.currentTime).toEqual(10);
    act(() => { store.dispatch(selectLoop(null, null)); });
  });

  it('shows hls errors and retries', async () => {
    await renderVideo();
    const hls = hlsInstances[0];

    act(() => {
      hls.handlers.hlsError('hlsError', { fatal: false, type: 'networkError' });
    });
    expect(screen.queryByText('Retry')).toBeNull();

    act(() => {
      hls.handlers.hlsError('hlsError', { fatal: true, type: 'networkError', response: { code: 404 } });
    });
    expect(screen.getByText('This video segment has not uploaded yet or has been deleted.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(hlsInstances).toHaveLength(2));
    expect(hls.destroy).toHaveBeenCalled();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('hands the position back to the wall clock on unmount', async () => {
    const { video, media, unmount } = await renderVideo();
    loadMetadata(video, media);
    media.currentTime = 42;

    unmount();
    expect(store.getState().offset).toEqual(42000);
    expect(currentOffset()).toEqual(42000);
  });
});
