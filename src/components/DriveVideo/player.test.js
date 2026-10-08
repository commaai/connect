import { describe, expect, it, vi } from 'vitest';

import {
  GENERIC_ERROR, NETWORK_ERROR, NOT_UPLOADED, applyIntent, hlsErrorMessage, isBuffering, loopRestartOffset,
  bufferLead, maxPlaybackRate, mediaErrorMessage, videoTime,
} from './player';

const fakeVideo = (props = {}) => ({
  error: null, paused: false, readyState: 4, playbackRate: 1, play: vi.fn(async () => {}), pause: vi.fn(), ...props,
});

describe('maxPlaybackRate', () => {
  it.each([
    [{ muted: true, firefox: false }, 16],
    [{ muted: false, firefox: false }, 16],
    [{ muted: true, firefox: true }, 16],
    [{ muted: false, firefox: true }, 8],
  ])('%j', (browser, expected) => {
    expect(maxPlaybackRate(browser)).toBe(expected);
  });
});

describe('bufferLead', () => {
  it.each([
    [0, 10], // paused
    [0.5, 10],
    [1, 10],
    [2, 10],
    [4, 16],
    [16, 64], // more than a segment: always loading the next
  ])('at %dx loads %d seconds ahead', (speed, expected) => {
    expect(bufferLead(speed)).toBe(expected);
  });
});

describe('videoTime', () => {
  it.each([
    [10000, 0, 10],
    [10000, 4000, 6],
    [1000, 4000, 0], // before the first frame
    [10000, undefined, 10],
  ])('offset %d, video starts at %s', (offset, videoStartOffset, expected) => {
    expect(videoTime(offset, videoStartOffset)).toBe(expected);
  });
});

describe('isBuffering', () => {
  it.each([
    ['has enough data', { readyState: 4 }, false],
    ['has just enough data to play on', { readyState: 3 }, false],
    ['has the next frame but not more, while playing', { readyState: 2 }, true],
    ['has nothing yet', { readyState: 0 }, true],
    ['has only metadata after a seek', { readyState: 1 }, true],
    ['has its frame, paused', { readyState: 2, paused: true }, false],
    ['has only metadata, paused', { readyState: 1, paused: true }, true],
    ['has failed', { readyState: 0, error: {} }, false],
  ])('a video that %s', (_name, props, expected) => {
    expect(isBuffering(fakeVideo(props))).toBe(expected);
  });
});

describe('loopRestartOffset', () => {
  const loop = { startTime: 10000, duration: 5000 };
  it.each([
    [12000, loop, null],
    [14999, loop, null],
    [15000, loop, 10000],
    [20000, loop, 10000],
    [20000, null, null],
    [20000, { startTime: 0, duration: 5000 }, null], // plays through, like currentOffset
    [20000, { startTime: 10000, duration: 0 }, null],
  ])('offset %d in %j', (offset, selected, expected) => {
    expect(loopRestartOffset(offset, selected)).toBe(expected);
  });
});

describe('error messages', () => {
  it.each([
    [{ type: 'networkError', response: { code: 404 } }, NOT_UPLOADED],
    [{ type: 'networkError', response: { code: 500 } }, NETWORK_ERROR],
    [{ type: 'networkError' }, NETWORK_ERROR],
    [{ type: 'mediaError' }, GENERIC_ERROR],
  ])('hls.js %j', (data, expected) => {
    expect(hlsErrorMessage(data)).toBe(expected);
  });

  it.each([
    [{ code: 2 }, NETWORK_ERROR],
    [{ code: 4 }, GENERIC_ERROR],
    [null, GENERIC_ERROR],
  ])('native %j', (error, expected) => {
    expect(mediaErrorMessage(error)).toBe(expected);
  });
});

describe('applyIntent', () => {
  const browser = { muted: true, firefox: false };

  it('plays a paused video at the asked speed', () => {
    const video = fakeVideo({ paused: true });
    applyIntent(video, { speed: 4, ...browser }, vi.fn());
    expect(video.playbackRate).toBe(4);
    expect(video.play).toHaveBeenCalledOnce();
  });

  it('changes the speed of a playing video without restarting it', () => {
    const video = fakeVideo();
    applyIntent(video, { speed: 2, ...browser }, vi.fn());
    expect(video.playbackRate).toBe(2);
    expect(video.play).not.toHaveBeenCalled();
  });

  it('caps the speed to what the browser can do', () => {
    const video = fakeVideo();
    applyIntent(video, { speed: 32, muted: false, firefox: true }, vi.fn());
    expect(video.playbackRate).toBe(8);
  });

  it('pauses a playing video, and leaves a paused one alone', () => {
    const playing = fakeVideo();
    applyIntent(playing, { speed: 0, ...browser }, vi.fn());
    expect(playing.pause).toHaveBeenCalledOnce();

    const paused = fakeVideo({ paused: true });
    applyIntent(paused, { speed: 0, ...browser }, vi.fn());
    expect(paused.pause).not.toHaveBeenCalled();
  });

  it('says so when the browser wants a tap before playing', async () => {
    const video = fakeVideo({ paused: true, play: vi.fn(() => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }))) });
    const onBlocked = vi.fn();
    applyIntent(video, { speed: 1, ...browser }, onBlocked);
    await vi.waitFor(() => expect(onBlocked).toHaveBeenCalledOnce());
  });

  it('ignores a play that was interrupted', async () => {
    const video = fakeVideo({ paused: true, play: vi.fn(() => Promise.reject(Object.assign(new Error('interrupted'), { name: 'AbortError' }))) });
    const onBlocked = vi.fn();
    applyIntent(video, { speed: 1, ...browser }, onBlocked);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('copes with a browser whose play() returns nothing', () => {
    const video = fakeVideo({ paused: true, play: vi.fn() });
    expect(() => applyIntent(video, { speed: 1, ...browser }, vi.fn())).not.toThrow();
  });
});
