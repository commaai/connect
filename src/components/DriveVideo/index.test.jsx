import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

import DriveVideo from '.';
import { currentOffset } from '../../timeline';
import { reducer, pause, play, seek, selectLoop } from '../../timeline/playback';

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (name) => `https://example.com/${name}.mp4` } },
}));

const route = { fullname: 'route', duration: 60000, videoStartOffset: 2000 };

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function mockPlay() {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    fireEvent.play(this);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function mockPause() {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
    fireEvent.pause(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function loadVideo(video) {
  Object.defineProperty(video, 'readyState', { value: HTMLMediaElement.HAVE_ENOUGH_DATA, configurable: true });
  Object.defineProperty(video, 'duration', { value: 60, configurable: true });
  fireEvent.loadedMetadata(video);
  fireEvent.canPlay(video);
}

async function renderVideo(state = {}) {
  const store = createStore(reducer, {
    desiredPlaySpeed: 1, isPlaying: true, offset: 12000, seekRequest: null,
    loop: { startTime: 0, duration: 60000 }, currentRoute: route, ...state,
  });
  const view = render(<Provider store={store}><DriveVideo isMuted /></Provider>);
  await waitFor(() => expect(view.container.querySelector('video')).not.toBeNull());
  const video = view.container.querySelector('video');
  loadVideo(video);
  return { ...view, store, video };
}

test('starts at the requested offset and drives the playback offset', async () => {
  const { store, video } = await renderVideo();
  expect(video.currentTime).toBe(10);

  video.currentTime = 20;
  expect(currentOffset(store.getState())).toBe(22000);

  act(() => store.dispatch(seek(32000)));
  expect(video.currentTime).toBe(30);
});

test('keeps seeks and playback inside the selected loop', async () => {
  const { store, video } = await renderVideo();
  act(() => store.dispatch(selectLoop(20000, 30000)));
  expect(video.currentTime).toBe(18);

  video.currentTime = 28.5;
  await waitFor(() => expect(video.currentTime).toBe(18));
});

test('follows play and pause from the browser', async () => {
  const { store, video } = await renderVideo();
  expect(video.play).toHaveBeenCalled();

  act(() => video.pause());
  expect(store.getState().isPlaying).toBe(false);

  act(() => { video.play(); });
  expect(store.getState().isPlaying).toBe(true);

  act(() => store.dispatch(pause()));
  expect(video.paused).toBe(true);
  act(() => store.dispatch(play()));
  expect(video.paused).toBe(false);
});

test('blocked autoplay leaves the video paused instead of loading', async () => {
  HTMLMediaElement.prototype.play.mockImplementation(() => Promise.reject(new DOMException('', 'NotAllowedError')));
  const { store } = await renderVideo();
  await waitFor(() => expect(store.getState().isPlaying).toBe(false));
});

test('shows errors and retries from the current offset', async () => {
  const { store, video, container } = await renderVideo();
  video.currentTime = 40;
  Object.defineProperty(video, 'error', { value: { code: 2, MEDIA_ERR_NETWORK: 2 } });
  fireEvent.error(video);
  expect(screen.getByText('Unable to load video. Check network connection.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(store.getState().offset).toBe(42000);
  await waitFor(() => expect(container.querySelector('video')).not.toBe(video));
  expect(screen.queryByText('Unable to load video. Check network connection.')).toBeNull();

  const retried = container.querySelector('video');
  loadVideo(retried);
  expect(retried.currentTime).toBe(40);
});
