import { vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { setVideo } from '../timeline/video';
import { useVideoBuffering, useVideoFrame, useVideoMuted, useVideoPaused, useVideoPlaybackRate } from './video';

function createVideo(values) {
  const video = document.createElement('video');
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(video, key, { configurable: true, writable: true, value });
  }
  return video;
}

function dispatch(video, type) {
  act(() => {
    video.dispatchEvent(new Event(type));
  });
}

afterEach(() => {
  act(() => setVideo(null));
  vi.restoreAllMocks();
});

describe('video hooks', () => {
  it('falls back to paused, 1x and muted before a video registers', () => {
    const { result } = renderHook(() => [useVideoPaused(), useVideoPlaybackRate(), useVideoMuted()]);
    expect(result.current).toEqual([true, 1, true]);
  });

  it('follows only the events of the value it reads', () => {
    const video = createVideo({ paused: true, playbackRate: 1, muted: true });
    act(() => setVideo(video));
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useVideoPaused();
    });

    video.paused = false;
    dispatch(video, 'play');
    expect(result.current).toBe(false);

    const rendersBefore = renders;
    video.playbackRate = 2;
    dispatch(video, 'ratechange');
    expect(renders).toBe(rendersBefore);
  });

  it('only buffers while playing once metadata has loaded', () => {
    const video = createVideo({ paused: true, networkState: 2, readyState: 1 });
    act(() => setVideo(video));
    const { result } = renderHook(() => useVideoBuffering());
    expect(result.current).toBe(false);

    video.paused = false;
    dispatch(video, 'play');
    expect(result.current).toBe(true);
  });

  it('reports the current time every frame until unmounted', () => {
    const frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => frames.push(frame));
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const video = createVideo({ currentTime: 12 });
    act(() => setVideo(video));
    const callback = vi.fn();

    const { unmount } = renderHook(() => useVideoFrame(callback));
    expect(callback).toHaveBeenLastCalledWith(12);

    video.currentTime = 13;
    frames.at(-1)();
    expect(callback).toHaveBeenLastCalledWith(13);

    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
