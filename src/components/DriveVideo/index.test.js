import React from 'react';
import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DriveVideo, VideoOverlay, correctedElementTime, isPlaybackProgress, isStallOver, needsInitialStall,
} from './index';

describe('DriveVideo stall end', () => {
  it('seeked at readyState 3 does not clear', () => {
    // seeked and playing can fire at readyState 3 with currentTime still frozen (iPad: 1.4s and 7s)
    expect(isStallOver(3)).toBe(false);
    expect(isStallOver(2)).toBe(false);
    expect(isStallOver(1)).toBe(false);
  });

  it('seeked at readyState 4 clears', () => {
    expect(isStallOver(4)).toBe(true); // iPad fwd10 (inside the buffer): seeked at 66ms with readyState 4
  });

  it('canplaythrough clears', () => {
    // canplaythrough fires on the transition to HAVE_ENOUGH_DATA, so the handler always sees readyState 4
    expect(isStallOver(4)).toBe(true);
  });
});

describe('DriveVideo stall state', () => {
  // the class without redux: a fake element, synchronous setState, fake timers for the 150ms spinner delay
  const stalledVideo = () => {
    const c = new DriveVideo({});
    c.setState = (next) => { c.state = { ...c.state, ...next }; };
    c.video = { readyState: 2, seeking: false, playbackRate: 1, removeEventListener: () => {} };
    c.onVideoStall(); // `waiting`
    return c;
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears on a data-ready signal once the element has enough data', () => {
    const c = stalledVideo();
    vi.advanceTimersByTime(150);
    expect(c.state.spinner).toBe(true);
    c.video.readyState = 3;
    c.onVideoDataReady(); // `seeked` at readyState 3: the picture may still be frozen
    expect(c.stalledAt).not.toBeNull();
    expect(c.state.spinner).toBe(true);
    c.video.readyState = 4;
    c.onVideoDataReady();
    expect(c.stalledAt).toBeNull();
    expect(c.state.spinner).toBe(false);
  });

  it('clears on playback progress', () => {
    const c = stalledVideo();
    vi.advanceTimersByTime(150);
    c.video.readyState = 4;
    c.onVideoProgress({ playedSeconds: 100 });
    c.onVideoProgress({ playedSeconds: 100.25 });
    expect(c.stalledAt).toBeNull();
    expect(c.state.spinner).toBe(false);
  });

  it('clears before the spinner shows, so a warm seek never shows it', () => {
    // desktop warm seek: seeking@3ms, seeked@16ms at readyState 4, well inside the 150ms delay
    const c = stalledVideo();
    vi.advanceTimersByTime(16);
    c.video.readyState = 4;
    c.onVideoDataReady();
    expect(c.stalledAt).toBeNull();
    vi.advanceTimersByTime(150);
    expect(c.state.spinner).toBe(false);
  });

  it('drops the stall on unmount and on a source change', () => {
    const c = stalledVideo();
    vi.advanceTimersByTime(150);
    c.componentWillUnmount();
    expect(c.stalledAt).toBeNull();

    const d = stalledVideo();
    vi.advanceTimersByTime(150);
    d.componentDidUpdate(d.props, { src: 'https://api.comma.ai/v1/route/a/qcamera.m3u8' }); // no route: src becomes ''
    expect(d.stalledAt).toBeNull();
    expect(d.state.spinner).toBe(false);
  });
});

describe('DriveVideo playback progress', () => {
  it('counts a normal 250ms step while playing', () => {
    expect(isPlaybackProgress(100, 100.25, false, 4)).toBe(true);
    expect(isPlaybackProgress(100, 100.25, false, 3)).toBe(true);
  });

  it('does not count the jump of our own seek', () => {
    expect(isPlaybackProgress(100, 400, false, 4)).toBe(false); // +300s right after `currentTime =`
    expect(isPlaybackProgress(100, 100.25, true, 4)).toBe(false); // element still seeking
    expect(isPlaybackProgress(100, 100.25, false, 2)).toBe(false); // no data at the new position yet
  });

  it('does not count a backward step (loop wrap)', () => {
    expect(isPlaybackProgress(100, 40, false, 4)).toBe(false);
    expect(isPlaybackProgress(100, 100, false, 4)).toBe(false); // frozen (iPad at readyState 3 after seeked)
  });

  it('needs a previous tick to compare against', () => {
    expect(isPlaybackProgress(null, 100.25, false, 4)).toBe(false);
  });

  it('scales the step bound with the playback rate', () => {
    expect(isPlaybackProgress(100, 102, false, 4, 8)).toBe(true); // 8x: 2s per 250ms tick
    expect(isPlaybackProgress(100, 102, false, 4, 1)).toBe(false);
    expect(isPlaybackProgress(100, 400, false, 4, 8)).toBe(false); // a seek is still a seek at 8x
    expect(isPlaybackProgress(100, 100.1, false, 4, 0.5)).toBe(true); // slow rates keep the rate-1 bound
  });
});

describe('DriveVideo late videoStartOffset', () => {
  it('moves the element back when the offset arrives after it was positioned', () => {
    // seeked to route offset 12000 with the offset unknown, 500ms of first-frame offset lands later
    expect(correctedElementTime(12, null, 500)).toBe(11.5);
    expect(correctedElementTime(12, undefined, 500)).toBe(11.5);
    expect(correctedElementTime(0.2, null, 500)).toBe(0); // clamped at the start of the video
  });

  it('is a no-op when the offset was already known when the element was positioned', () => {
    expect(correctedElementTime(12, 500, 500)).toBeNull();
    expect(correctedElementTime(12, null, null)).toBeNull();
    expect(correctedElementTime(12, undefined, null)).toBeNull(); // no first frame event, nothing to correct
  });

  it('applies the same shift after a user seek, which was also computed with the stale offset', () => {
    // the seek wrote (200000 - 0) / 1000; with the offset known it should have been (200000 - 500) / 1000
    expect(correctedElementTime(200, null, 500)).toBe(199.5);
  });

  it('shifts by the difference when the offset changes from one number to another', () => {
    expect(correctedElementTime(12, 300, 500)).toBeCloseTo(11.8, 6);
    expect(correctedElementTime(12, 500, 300)).toBeCloseTo(12.2, 6);
  });
});

describe('DriveVideo initial stall', () => {
  it('stalls when the source lands with no data yet', () => {
    // iPad toStart / toMiddle: 500-630ms at readyState 1 with no frame and, before B3, no spinner
    expect(needsInitialStall(1)).toBe(true);
    expect(needsInitialStall(0)).toBe(true); // no element yet (first mount) counts as HAVE_NOTHING
    expect(needsInitialStall(3)).toBe(true); // Safari freezes at readyState 3 (B2.1), still waiting
  });

  it('does not stall when the element already has enough data', () => {
    expect(needsInitialStall(4)).toBe(false);
  });

  it('stalls again for a new source after a warm one', () => {
    // componentDidUpdate asks on every source change, so the warm previous source does not carry over
    expect(needsInitialStall(4)).toBe(false); // the previous source, fully buffered
    expect(needsInitialStall(0)).toBe(true); // the new source, just set on the element
  });
});

describe('DriveVideo overlay precedence', () => {
  it('shows the error rather than the spinner or the prompt', () => {
    render(React.createElement(VideoOverlay, { loading: true, error: 'Unable to load video', tapToPlay: true, onTap: () => {} }));
    expect(screen.getByText('Unable to load video')).toBeInTheDocument();
    expect(screen.queryByText('Tap to play')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows the prompt rather than the spinner', () => {
    render(React.createElement(VideoOverlay, { loading: true, error: null, tapToPlay: true, onTap: () => {} }));
    expect(screen.getByText('Tap to play')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows the spinner only while loading with nothing else to say', () => {
    const { unmount } = render(React.createElement(VideoOverlay, { loading: true, error: null, tapToPlay: false, onTap: () => {} }));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    unmount();
    const { container } = render(React.createElement(VideoOverlay, { loading: false, error: null, tapToPlay: false, onTap: () => {} }));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DriveVideo hls.js errors', () => {
  const video = () => { const c = new DriveVideo({}); c.setState = (next) => { c.state = { ...c.state, ...next }; }; return c; };

  it('ignores non-fatal errors, which hls.js recovers from itself', () => {
    const c = video();
    c.onHlsError({ type: 'mediaError', details: 'bufferSeekOverHole', fatal: false }); // iPad, route with audio
    c.onHlsError({ type: 'mediaError', details: 'bufferStalledError', fatal: false });
    c.onHlsError({ type: 'networkError', details: 'fragLoadError', fatal: false, response: { code: 404 } }); // still retrying
    expect(c.state.videoError).toBeNull();
  });

  it('shows the missing-segment message on a fatal 404 and a generic one otherwise', () => {
    const c = video();
    c.onHlsError({ type: 'networkError', details: 'fragLoadError', fatal: true, response: { code: 404 } });
    expect(c.state.videoError).toBe('This video segment has not uploaded yet or has been deleted.');
    const d = video();
    d.onHlsError({ type: 'mediaError', details: 'bufferAppendError', fatal: true });
    expect(d.state.videoError).toBe('Unable to load video');
  });
});
