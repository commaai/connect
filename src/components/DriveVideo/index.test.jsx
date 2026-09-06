import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

import DriveVideo from '.';
import { createInitialState } from '../../initialState';
import { reducer, pause, play, seek, selectLoop, setPlaybackSpeed } from '../../timeline/playback';

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

async function mountVideo() {
  const store = createStore((state, action) => action.type === 'TEST_ROUTE'
    ? { ...state, currentRoute: action.route, loop: null }
    : reducer(state, action), { ...createInitialState('/'), currentRoute: route });
  const view = render(<Provider store={store}><DriveVideo isMuted /></Provider>);
  await waitFor(() => expect(view.container.querySelector('video')).not.toBeNull());
  const video = view.container.querySelector('video');
  Object.defineProperty(video, 'duration', { value: 60 });
  fireEvent.canPlay(video);
  return { ...view, store, video };
}

test('plays, pauses, seeks and keeps the timeline in sync', async () => {
  const { store, video } = await mountVideo();
  expect(video.play).toHaveBeenCalledTimes(1);
  expect(store.getState().videoStatus).toBe('ready');

  video.currentTime = 12;
  fireEvent.timeUpdate(video);
  expect(store.getState().offset).toBe(14000);
  expect(store.getState().seekRequest).toBeNull();

  act(() => store.dispatch(pause()));
  expect(video.pause).toHaveBeenCalled();
  act(() => store.dispatch(seek(17000)));
  expect(video.currentTime).toBe(15);
  expect(store.getState().isPlaying).toBe(false);

  act(() => {
    store.dispatch(setPlaybackSpeed(4));
    store.dispatch(play());
  });
  expect(video.play).toHaveBeenCalledTimes(2);
  expect(video.playbackRate).toBe(4);
});

test('seeks to the selected loop and wraps while playing', async () => {
  const { store, video } = await mountVideo();
  act(() => {
    store.dispatch(pause());
    store.dispatch(selectLoop(20000, 30000));
  });
  expect(video.currentTime).toBe(18);

  act(() => store.dispatch(seek(30000)));
  fireEvent.timeUpdate(video);
  expect(video.currentTime).toBe(28);
  expect(store.getState().offset).toBe(30000);

  act(() => store.dispatch(play()));
  fireEvent.timeUpdate(video);
  expect(video.currentTime).toBe(18);
});

test('shows media errors without overwriting timeline navigation and recovers when playable', async () => {
  const { store, video, getByText, queryByText } = await mountVideo();
  fireEvent.error(video);
  fireEvent.waiting(video);
  expect(store.getState().videoStatus).toBe('failed');
  expect(getByText('Unable to load video')).toBeVisible();

  act(() => store.dispatch(seek(16000)));
  video.currentTime = 0;
  fireEvent.timeUpdate(video);
  expect(store.getState().offset).toBe(16000);

  fireEvent.canPlay(video);
  expect(store.getState().videoStatus).toBe('ready');
  expect(queryByText('Unable to load video')).toBeNull();
});

test('changing routes resets playback and ignores events from the old video', async () => {
  const { store, video, container } = await mountVideo();
  act(() => {
    store.dispatch(seek(15000));
    store.dispatch(setPlaybackSpeed(4));
    store.dispatch(pause());
    store.dispatch({ type: 'TEST_ROUTE', route: { ...route, fullname: 'next' } });
  });
  await waitFor(() => expect(container.querySelector('video')).not.toBe(video));
  expect(store.getState()).toMatchObject({
    offset: 0, seekRequest: null, desiredPlaySpeed: 1, isPlaying: true, videoStatus: 'loading',
  });

  video.currentTime = 42;
  fireEvent.timeUpdate(video);
  fireEvent.error(video);
  expect(store.getState().offset).toBe(0);
  expect(store.getState().videoStatus).toBe('loading');
});
