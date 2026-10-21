import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';

import DriveVideo from '.';
import { reducer } from '../../timeline/playback';

const mocks = vi.hoisted(() => ({ store: null }));

vi.mock('../../store', () => ({ default: { getState: () => mocks.store.getState() } }));

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (name) => `https://example.com/${name}/qcamera.m3u8` } },
}));

function setVideoState(video, state) {
  Object.entries(state).forEach(([key, value]) => Object.defineProperty(video, key, { configurable: true, value }));
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    setVideoState(this, { paused: false });
    fireEvent.play(this);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    setVideoState(this, { paused: true });
    fireEvent.pause(this);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// a minute of video starting 2 s into the drive, with 0:10-0:30 of the drive selected
function mount() {
  const currentRoute = { fullname: 'dongle|drive', videoStartOffset: 2000 };
  const zoom = { start: 10000, end: 30000 };
  mocks.store = createStore(reducer, { currentRoute, desiredPlaySpeed: 1, isPlaying: false, offset: null, zoom }, applyMiddleware(thunk));
  const { container } = render(<Provider store={mocks.store}><DriveVideo isMuted /></Provider>);
  const video = container.querySelector('video');
  setVideoState(video, { readyState: 4, duration: 60 });
  Object.defineProperty(video, 'ended', { configurable: true, get: () => video.currentTime >= video.duration });
  return { store: mocks.store, video };
}

test('the timeline follows the video, also when something else pauses it', () => {
  const { store, video } = mount();
  expect(video.currentTime).toBe(8);
  expect(store.getState()).toMatchObject({ isPlaying: true, offset: 10000 });

  video.currentTime = 20;
  video.pause();
  expect(store.getState()).toMatchObject({ isPlaying: false, offset: 22000 });
});

test('repeats the selected range, also when it ends with the video', () => {
  const { video } = mount();
  video.currentTime = 28.1;
  fireEvent.timeUpdate(video);
  expect(video.currentTime).toBe(8);

  setVideoState(video, { duration: 28 });
  video.currentTime = 28;
  video.pause(); // as the browser does at the end
  expect(video.currentTime).toBe(8);
  expect(video.paused).toBe(false);
});

test('says when the video can\'t load', () => {
  const { video } = mount();
  setVideoState(video, { error: { code: 4 }, readyState: 0 });
  fireEvent.error(video);
  fireEvent.waiting(video);
  expect(screen.getByText('Unable to load video')).toBeInTheDocument();
});
