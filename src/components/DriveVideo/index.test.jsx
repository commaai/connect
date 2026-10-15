import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

import DriveVideo from '.';
import { createInitialState } from '../../initialState';
import { reducer, seek, selectLoop } from '../../timeline/playback';

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (name) => `https://example.com/${name}.mp4` } },
}));

const route = { fullname: 'drive', duration: 60000, videoStartOffset: 2000 };

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    fireEvent.play(this);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    fireEvent.pause(this);
  });
});
afterEach(() => vi.restoreAllMocks());

const findVideo = (previous) => waitFor(() => {
  const video = document.querySelector('video');
  expect(video).not.toBeNull();
  expect(video).not.toBe(previous);
  return video;
});

async function mountVideo() {
  const store = createStore(reducer, { ...createInitialState('/'), currentRoute: route });
  render(<Provider store={store}><DriveVideo isMuted onAudioStatusChange={() => {}} /></Provider>);
  const video = await findVideo();
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  await act(async () => fireEvent.canPlay(video));
  return { store, video };
}

test('the video drives playback state', async () => {
  const { store, video } = await mountVideo();
  expect(screen.queryByRole('progressbar')).toBeNull();

  video.currentTime = 12;
  fireEvent.timeUpdate(video);
  expect(store.getState().offset).toBe(14000);

  act(() => store.dispatch(seek(20000)));
  expect(video.currentTime).toBe(18);
  fireEvent.seeking(video);
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
  fireEvent.seeked(video);
  expect(screen.queryByRole('progressbar')).toBeNull();

  fireEvent.pause(video);
  expect(store.getState().isPlaying).toBe(false);
});

test('loops the selection', async () => {
  const { store, video } = await mountVideo();
  act(() => store.dispatch(selectLoop(20000, 30000)));
  expect(video.currentTime).toBe(18);

  video.currentTime = 28;
  fireEvent.timeUpdate(video);
  expect(video.currentTime).toBe(18);
});

test('blocked autoplay leaves the video paused', async () => {
  HTMLMediaElement.prototype.play.mockRejectedValueOnce(new DOMException('', 'NotAllowedError'));
  const { store } = await mountVideo();
  await waitFor(() => expect(store.getState().isPlaying).toBe(false));
  expect(screen.queryByRole('progressbar')).toBeNull();
});

test('errors show with a retry, seeking retries', async () => {
  const { store, video } = await mountVideo();
  fireEvent.error(video);
  expect(screen.getByText('Unable to load video')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

  act(() => store.dispatch(seek(30000)));
  const retried = await findVideo(video);
  fireEvent.canPlay(retried);
  expect(retried.currentTime).toBe(28);
  retried.currentTime = 0; // webkit reports 0 before the new player has a frame
  fireEvent.timeUpdate(retried);
  expect(store.getState().offset).toBe(30000);
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
});
