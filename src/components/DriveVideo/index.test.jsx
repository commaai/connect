import React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import DriveVideo from '.';
import { currentOffset } from '../../timeline';
import { pause, reducer, seek, selectLoop } from '../../timeline/playback';

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (route) => `https://video.test/${route}.m3u8` } },
}));
vi.mock('hls.js/light', () => ({ default: { isSupported: () => false } })); // native playback path

const initialState = {
  desiredPlaySpeed: 1,
  offset: null,
  seekId: 0,
  loop: null,
  currentRoute: { fullname: 'dongle|route', videoStartOffset: 0 },
};

async function setup(state = {}) {
  const store = createStore((current = { ...initialState, ...state }, action) => reducer(current, action));
  render(<Provider store={store}><DriveVideo /></Provider>);
  const video = document.querySelector('video');
  await waitFor(() => expect(video.getAttribute('src')).toBe('https://video.test/dongle|route.m3u8'));

  // jsdom does not play media, so give the element a position and a loaded state
  let time = 0;
  Object.defineProperty(video, 'currentTime', { get: () => time, set: (value) => { time = value; }, configurable: true });
  Object.defineProperty(video, 'readyState', { get: () => 4, configurable: true });
  act(() => { fireEvent.loadedMetadata(video); });
  return { store, video };
}

describe('DriveVideo', () => {
  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.load = vi.fn();
  });

  it('buffers behind a stepped 12-spoke indicator, not MUI\'s SVG spinner that repaints every frame (an iPhone fell to 40 fps)', async () => {
    const { video } = await setup();
    act(() => { fireEvent(video, new Event('waiting')); });
    const spinner = await screen.findByRole('progressbar', { name: 'Loading video' }, { timeout: 2000 });
    expect(spinner.className).toContain('steps(12');
    expect(spinner.querySelector('svg')).toBeNull();
    expect(spinner.children).toHaveLength(12); // the fading trail is what makes the steps read as motion
  });

  it('starts at the beginning of the loop and plays', async () => {
    const { store, video } = await setup({ loop: { startTime: 30000, duration: 10000 } });
    expect(video.currentTime).toBe(30);
    expect(video.play).toHaveBeenCalled();
    expect(currentOffset(store.getState())).toBe(30000);
  });

  it('applies seek requests, also while paused', async () => {
    const { store, video } = await setup();
    act(() => { store.dispatch(pause()); });
    expect(video.pause).toHaveBeenCalled();
    const plays = video.play.mock.calls.length;

    act(() => { store.dispatch(seek(35000)); });
    expect(video.currentTime).toBe(35);
    expect(video.play).toHaveBeenCalledTimes(plays);
    expect(currentOffset(store.getState())).toBe(35000);
  });

  it('wraps around at the end of a loop that starts at 0', async () => {
    const { store, video } = await setup();
    act(() => { store.dispatch(selectLoop(0, 10000)); });
    video.currentTime = 10.5;
    act(() => { fireEvent.timeUpdate(video); });
    expect(video.currentTime).toBe(0);
  });

  it('follows pauses that happen outside the app', async () => {
    const { store, video } = await setup();
    act(() => { fireEvent.pause(video); });
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('toggles playback when the video is clicked', async () => {
    const { store, video } = await setup();
    fireEvent.click(video);
    expect(store.getState().desiredPlaySpeed).toBe(0);
    fireEvent.click(video);
    expect(store.getState().desiredPlaySpeed).toBe(1);
  });

  it('shows an error and reloads on retry', async () => {
    const { video } = await setup();
    act(() => { fireEvent.error(video); });
    expect(await screen.findByText('Unable to load video')).toBeTruthy();

    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(screen.queryByText('Unable to load video')).toBeNull());
    expect(video.load).toHaveBeenCalled();
  });
});
