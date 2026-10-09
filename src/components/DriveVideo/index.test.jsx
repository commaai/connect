import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

import DriveVideo from '.';
import { resetOffset, seek } from '../../timeline';
import { reducer as playbackReducer } from '../../timeline/playback';

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: () => 'https://example.test/route.m3u8' } },
}));

vi.mock('hls.js', () => ({
  default: class Hls {
    static isSupported() { return false; }
  },
  Events: { ERROR: 'error', BUFFER_CODECS: 'bufferCodecs' },
  ErrorTypes: { NETWORK_ERROR: 'network', MEDIA_ERROR: 'media' },
  ErrorDetails: {},
}));

const route = {
  fullname: 'route',
  duration: 60000,
  videoStartOffset: 0,
};

function mountVideo(overrides = {}) {
  let nextFrame;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    nextFrame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  const initialState = {
    desiredPlaySpeed: 0,
    isBufferingVideo: false,
    isPlaying: false,
    loop: { startTime: 10000, duration: 10000 },
    currentRoute: route,
    ...overrides,
  };
  const store = createStore(playbackReducer, initialState);
  const view = render(<Provider store={store}><DriveVideo isMuted /></Provider>);
  const video = view.container.querySelector('video');
  Object.defineProperty(video, 'duration', { configurable: true, value: 60 });

  return { ...view, nextFrame, store, video };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetOffset(0);
});

test('keeps paused seeks inside the selected loop', () => {
  resetOffset(10000);
  const { nextFrame, video, unmount } = mountVideo();

  act(() => {
    fireEvent.loadedMetadata(video);
    seek(30000);
    nextFrame();
  });

  expect(video.currentTime).toBe(20);
  expect(() => unmount()).not.toThrow();
});

test('derives buffering and playing state from media events', () => {
  const { store, video, unmount } = mountVideo({ isBufferingVideo: true });

  act(() => fireEvent.waiting(video));
  expect(store.getState().isBufferingVideo).toBe(true);

  act(() => fireEvent.canPlay(video));
  expect(store.getState().isBufferingVideo).toBe(false);

  act(() => fireEvent.playing(video));
  expect(store.getState().isPlaying).toBe(true);

  act(() => fireEvent.pause(video));
  expect(store.getState().isPlaying).toBe(false);
  unmount();
});

test('shows a retry action for native media errors', () => {
  const { getByRole, getByText, queryByText, video, unmount } = mountVideo();
  Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } });

  act(() => fireEvent.error(video));
  expect(getByText('Unable to load video. Check network connection.')).toBeVisible();

  act(() => fireEvent.click(getByRole('button', { name: 'Retry' })));
  expect(queryByText('Unable to load video. Check network connection.')).toBeNull();
  unmount();
});
