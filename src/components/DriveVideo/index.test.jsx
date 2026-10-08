import { vi } from 'vitest';
import { DriveVideo } from './index';
import { seek } from '../../timeline/playback';
import { ACTION_BUFFER_VIDEO, ACTION_SEEK, ACTION_VIDEO_PROGRESS } from '../../actions/types';
import { isIos } from '../../utils/browser.js';

vi.mock('../../utils/browser.js', () => ({ isIos: vi.fn(() => false) }));

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (_route, _exp, sig) => `https://example.test/shared.m3u8${sig ? `?sig=${sig}` : ''}` } },
}));

const route = (fullname, share_sig) => ({ fullname, videoStartOffset: 0, share_sig });

function playerFixture() {
  const dispatch = vi.fn();
  const audio = vi.fn();
  const props = {
    currentRoute: route('route-A'),
    offset: 0,
    seekRevision: 0,
    loop: null,
    desiredPlaySpeed: 1,
    isBufferingVideo: false,
    isMuted: false,
    dispatch,
    onAudioStatusChange: audio,
  };
  const video = new DriveVideo(props);
  // Exercise the actual player callbacks without mounting a browser decoder.
  video.setState = (update) => {
    video.state = {
      ...video.state,
      ...(typeof update === 'function' ? update(video.state, video.props) : update),
    };
  };
  const media = {
    time: 0,
    getCurrentTime: vi.fn(() => media.time),
    seekTo: vi.fn(),
    getInternalPlayer: vi.fn(() => null),
  };
  video.videoPlayer.current = media;
  const playerElement = () => video.render().props.children[1];
  const callbacks = () => playerElement().props;
  const changeProps = (changes) => {
    const previous = video.props;
    video.props = { ...video.props, ...changes };
    video.componentDidUpdate(previous);
  };
  callbacks().onReady(media);
  dispatch.mockClear();
  return { video, media, callbacks, playerElement, changeProps, dispatch, audio };
}

describe('DriveVideo player lifecycle', () => {
  it('ignores old seek completions and observations until the newest seek reaches its target', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();
    changeProps({ offset: 4000, seekRevision: 1 });
    expect(media.seekTo).toHaveBeenCalledWith(4, 'seconds');
    changeProps({ offset: 12000, seekRevision: 2 });
    expect(media.seekTo).toHaveBeenLastCalledWith(12, 'seconds');

    const event = callbacks();
    media.time = 4;
    event.onSeek(4);
    event.onProgress();
    expect(video.pendingSeek).toEqual({ revision: 2, target: 12 });
    expect(media.seekTo).toHaveBeenCalledTimes(3); // one bounded reassertion
    expect(dispatch.mock.calls.some(([a]) => a.type === ACTION_VIDEO_PROGRESS)).toBe(false);

    media.time = 12;
    event.onSeek(12);
    expect(video.pendingSeek).toBeNull();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: ACTION_VIDEO_PROGRESS, offset: 12000, seekRevision: 2 }));
  });

  it('does not acknowledge a seek merely because its event reports the target while the media clock is old', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();
    changeProps({ offset: 15000, seekRevision: 1 });
    media.time = 2;
    callbacks().onSeek(15);
    expect(video.pendingSeek).not.toBeNull();
    expect(dispatch.mock.calls.some(([a]) => a.type === ACTION_VIDEO_PROGRESS)).toBe(false);
    media.time = 15;
    callbacks().onProgress();
    expect(video.pendingSeek).toBeNull();
  });
  it('does not publish a decoder reset when buffering starts late', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();

    changeProps({ offset: 55000, seekRevision: 1 });
    media.time = 55;
    callbacks().onSeek(55);
    dispatch.mockClear();

    // The decoder resets BEFORE onBuffer, so bufferingAtSeconds is already zero.
    media.time = 0;
    callbacks().onBuffer();
    callbacks().onBufferEnd();

    expect(media.seekTo).toHaveBeenLastCalledWith(55, 'seconds');
    expect(video.pendingSeek).toEqual({ revision: 1, target: 55 });
    expect(dispatch.mock.calls.some(
      ([action]) => action.type === ACTION_VIDEO_PROGRESS && action.offset === 0,
    )).toBe(false);
  });

  it('uses actual accepted media time even when Redux props lag behind', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();

    changeProps({ offset: 55000, seekRevision: 1 });
    media.time = 55;
    callbacks().onSeek(55);

    media.time = 55.5;
    callbacks().onProgress(); // Redux props deliberately remain at offset 55000.
    expect(video.lastAcceptedSeconds).toBe(55.5);
    dispatch.mockClear();

    media.time = 0;
    callbacks().onBuffer();
    callbacks().onBufferEnd();

    expect(media.seekTo).toHaveBeenLastCalledWith(55.5, 'seconds');
    expect(video.pendingSeek).toEqual({ revision: 1, target: 55.5 });
    expect(dispatch.mock.calls.some(
      ([action]) => action.type === ACTION_VIDEO_PROGRESS && action.offset === 0,
    )).toBe(false);
  });

  it('accepts intentional backward seeks instead of restoring an old playback position', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();

    changeProps({ offset: 55000, seekRevision: 1 });
    media.time = 55;
    callbacks().onSeek(55);
    expect(video.lastAcceptedSeconds).toBe(55);

    changeProps({ offset: 20000, seekRevision: 2 });
    expect(video.lastAcceptedSeconds).toBeNull();
    media.time = 20;
    dispatch.mockClear();
    callbacks().onSeek(20);

    expect(video.pendingSeek).toBeNull();
    expect(media.seekTo).toHaveBeenLastCalledWith(20, 'seconds');
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: ACTION_VIDEO_PROGRESS, offset: 20000, seekRevision: 2,
    }));
  });

  it('ignores unsolicited decoder rewinds even without a buffer event', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();

    changeProps({ offset: 55000, seekRevision: 1 });
    media.time = 55;
    callbacks().onSeek(55);
    dispatch.mockClear();

    media.time = 0;
    callbacks().onProgress();

    expect(media.seekTo).toHaveBeenLastCalledWith(55, 'seconds');
    expect(video.pendingSeek).toEqual({ revision: 1, target: 55 });
    expect(dispatch.mock.calls.some(
      ([action]) => action.type === ACTION_VIDEO_PROGRESS && action.offset === 0,
    )).toBe(false);
  });

  it('does not report an unavailable video from an older seek completion', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();

    media.getDuration = vi.fn(() => 10);

    changeProps({ offset: 10000, seekRevision: 1 });
    media.time = 10;
    callbacks().onSeek(10);
    expect(video.pendingSeek).toBeNull();

    changeProps({ offset: 12000, seekRevision: 2 });
    dispatch.mockClear();

    // Delayed event from the previous seek.
    callbacks().onSeek(10);

    expect(video.state.videoError).toBeNull();
    expect(video.pendingSeek).toEqual({ revision: 2, target: 12 });
    expect(
      dispatch.mock.calls.some(([action]) => action.type === ACTION_VIDEO_PROGRESS),
    ).toBe(false);
  });
  it('does not fail playback after repeated stale seeks when media duration grows', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();

    let duration = 10;
    media.getDuration = vi.fn(() => duration);

    // The initial seek completes at the current end of the media.
    changeProps({ offset: 10000, seekRevision: 1 });
    media.time = 10;
    callbacks().onSeek(10);
    expect(video.pendingSeek).toBeNull();

    // A newer seek targets a position that may become available shortly.
    changeProps({ offset: 12000, seekRevision: 2 });
    dispatch.mockClear();

    // Repeated old-position events must not permanently fail playback.
    callbacks().onSeek(10);
    callbacks().onSeek(10);
    expect(video.state.videoError).toBeNull();

    // The stream's duration grows, and the desired position becomes available.
    duration = 12;
    media.time = 12;
    callbacks().onProgress();

    expect(video.pendingSeek).toBeNull();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ACTION_VIDEO_PROGRESS,
        offset: 12000,
        seekRevision: 2,
      }),
    );
  });

  it('does not mark a clamped seek unavailable based only on seek callbacks', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();

    // Route requests 12 seconds, but the available video ends at 10.
    media.getDuration = vi.fn(() => 10);

    changeProps({ offset: 12000, seekRevision: 1 });
    expect(media.seekTo).toHaveBeenCalledWith(12, 'seconds');

    // Simulate the browser clamping the seek to the end of the media.
    media.time = 10;

    // First mismatch: retry the latest seek instead of reporting an error.
    callbacks().onSeek(10);
    expect(video.state.videoError).toBeNull();
    expect(video.pendingSeek).toEqual({ revision: 1, target: 12 });
    expect(media.seekTo).toHaveBeenCalledTimes(2);

    // Second mismatch: the retried seek also stops at the media's end.
    callbacks().onSeek(10);
    callbacks().onProgress();

    // Two seek callbacks cannot prove that the requested position is unavailable.
    expect(video.state.videoError).toBeNull();
    expect(video.pendingSeek).toEqual({ revision: 1, target: 12 });

    // Never overwrite the requested timeline with an incorrect timestamp.
    expect(
      dispatch.mock.calls.some(([action]) => action.type === ACTION_VIDEO_PROGRESS),
    ).toBe(false);
  });

  it('does not clear buffering while the media clock is stalled', () => {
    const { media, callbacks, changeProps, dispatch } = playerFixture();

    // Establish a successfully reached playback position.
    changeProps({ offset: 10000, seekRevision: 1 });
    media.time = 10;
    callbacks().onSeek(10);
    dispatch.mockClear();

    // The player enters buffering.
    callbacks().onBuffer();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ACTION_BUFFER_VIDEO,
        buffering: true,
      }),
    );

    dispatch.mockClear();

    // Progress callbacks arrive, but video time has not advanced.
    callbacks().onProgress();
    callbacks().onProgress();

    // Stale progress must not clear the buffering state.
    expect(
      dispatch.mock.calls.some(
        ([action]) => action.type === ACTION_VIDEO_PROGRESS,
      ),
    ).toBe(false);
  });

  it('clears buffering when the media clock advances', () => {
    const { media, callbacks, changeProps, dispatch } = playerFixture();

    changeProps({ offset: 10000, seekRevision: 1 });
    media.time = 10;
    callbacks().onSeek(10);
    dispatch.mockClear();

    callbacks().onBuffer();
    dispatch.mockClear();

    // Still stalled: no progress acknowledgement.
    callbacks().onProgress();
    expect(
      dispatch.mock.calls.some(
        ([action]) => action.type === ACTION_VIDEO_PROGRESS,
      ),
    ).toBe(false);

    // Playback resumes and the media clock advances.
    media.time = 10.05;
    callbacks().onProgress();

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ACTION_VIDEO_PROGRESS,
        offset: 10050,
        seekRevision: 1,
      }),
    );
  });

  it('clears buffering on buffer end while remaining paused', () => {
    const { media, callbacks, changeProps, dispatch } = playerFixture();

    changeProps({ offset: 10000, seekRevision: 1 });
    media.time = 10;
    callbacks().onSeek(10);

    changeProps({ desiredPlaySpeed: 0 });
    expect(callbacks().playing).toBe(false);
    dispatch.mockClear();

    callbacks().onBuffer();
    dispatch.mockClear();

    // The clock is stationary while paused.
    callbacks().onProgress();
    expect(
      dispatch.mock.calls.some(
        ([action]) => action.type === ACTION_VIDEO_PROGRESS,
      ),
    ).toBe(false);

    // The browser confirms buffering has ended.
    callbacks().onBufferEnd();

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ACTION_VIDEO_PROGRESS,
        offset: 10000,
        seekRevision: 1,
      }),
    );

    expect(callbacks().playing).toBe(false);
  });

  it('ignores stale buffer end events after a route change', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();

    media.time = 8;
    const oldCallbacks = callbacks();
    oldCallbacks.onBuffer();

    expect(video.bufferingAtSeconds).toBe(8);

    // Switching routes invalidates the old player's callbacks.
    changeProps({ currentRoute: route('route-B') });

    expect(video.bufferingAtSeconds).toBeNull();
    dispatch.mockClear();

    oldCallbacks.onBufferEnd();

    expect(dispatch).not.toHaveBeenCalled();

    // The new player should report progress independently.
    media.time = 0;
    callbacks().onReady(media);
    callbacks().onProgress();

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ACTION_VIDEO_PROGRESS,
        offset: 0,
        seekRevision: 0,
      }),
    );
  });

  it('ignores late errors, buffer events and progress from a prior route even when the URL is shared', () => {
    const { video, media, callbacks, playerElement, changeProps, dispatch } = playerFixture();
    const fromOldPlayer = callbacks();
    const oldKey = playerElement().key;
    changeProps({ currentRoute: route('route-B') });
    expect(callbacks().url).toBe(fromOldPlayer.url);
    expect(playerElement().key).not.toBe(oldKey);
    dispatch.mockClear();

    fromOldPlayer.onBuffer();
    fromOldPlayer.onError(new Error('old route failed'));
    fromOldPlayer.onReady(media);
    fromOldPlayer.onProgress();
    expect(video.state.videoError).toBeNull();
    expect(video.ready).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();

    callbacks().onReady(media);
    expect(video.ready).toBe(true);
  });


  it('invalidates old callbacks when a signed URL rotates for the same route', () => {
    const { video, callbacks, playerElement, changeProps, media } = playerFixture();
    const original = callbacks();
    const oldKey = playerElement().key;
    changeProps({ currentRoute: route('route-A', 'new-credential') });
    expect(playerElement().key).not.toBe(oldKey);
    expect(callbacks().url).toContain('new-credential');
    original.onError(new Error('expired URL'));
    original.onReady(media);
    expect(video.state.videoError).toBeNull();
    expect(video.ready).toBe(false);
  });

  it('ignores callbacks after the video component unmounts', () => {
    const { video, callbacks, dispatch } = playerFixture();
    const handlers = callbacks();
    video.componentWillUnmount();
    handlers.onError(new Error('late network response'));
    handlers.onBuffer();
    handlers.onProgress();
    expect(video.state.videoError).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('preserves pause and position on Retry and ignores callbacks from the failed player', () => {
    const { video, media, callbacks, playerElement, changeProps, dispatch } = playerFixture();
    changeProps({ desiredPlaySpeed: 0, offset: 8000, seekRevision: 1 });
    media.time = 8;
    const failedPlayer = callbacks();
    const failedKey = playerElement().key;
    failedPlayer.onError(new Error('network failed'));
    expect(video.state.videoError).toBeTruthy();
    expect(callbacks().playing).toBe(false);

    video.retryVideo();
    expect(video.state.videoError).toBeNull();
    expect(playerElement().key).not.toBe(failedKey);
    expect(callbacks().playing).toBe(false);
    failedPlayer.onError(new Error('late failed source'));
    expect(video.state.videoError).toBeNull();

    media.time = 0;
    callbacks().onReady(media);
    expect(media.seekTo).toHaveBeenLastCalledWith(8, 'seconds');
    expect(dispatch.mock.calls.some(([a]) => a.type === ACTION_BUFFER_VIDEO)).toBe(true);
  });

  it('keeps fatal errors visible after later ready/play events until Retry', () => {
    const { video, callbacks } = playerFixture();
    const events = callbacks();
    events.onError('hlsError', { fatal: true, type: 'networkError', response: { code: 404 } });
    expect(video.state.videoError).toMatch(/not uploaded/i);
    events.onBufferEnd();
    events.onProgress();
    expect(video.state.videoError).toMatch(/not uploaded/i);
    expect(callbacks().playing).toBe(false);
    video.retryVideo();
    expect(video.state.videoError).toBeNull();
  });

  it('does not treat recoverable HLS warnings as fatal errors', () => {
    const { video, callbacks } = playerFixture();
    callbacks().onError('hlsError', { fatal: false, type: 'mediaError', details: 'fragParsingError' });
    expect(video.state.videoError).toBeNull();
  });

  it('still generates explicit loop seeks rather than advancing an independent clock', () => {
    const { media, callbacks, changeProps, dispatch } = playerFixture();
    changeProps({ loop: { startTime: 0, duration: 1000 } });
    media.time = 1.2;
    callbacks().onProgress();
    expect(dispatch).toHaveBeenCalledWith(seek(0));
    expect(dispatch.mock.calls.some(([a]) => a.type === ACTION_SEEK)).toBe(true);
  });

  it('restarts a natively ended loop after its restart seek is acknowledged', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();
    changeProps({ loop: { startTime: 1000, duration: 9000 }, offset: 10000 });
    dispatch.mockClear();

    // Native HTMLVideoElement is now paused/ended even though desired speed remains 1x.
    callbacks().onEnded();
    expect(dispatch).toHaveBeenCalledWith(seek(1000));
    expect(video.state.restartingLoop).toBe(true);
    expect(callbacks().playing).toBe(false); // Force ReactPlayer's playback edge.

    changeProps({ offset: 1000, seekRevision: 1 });
    media.time = 1;
    callbacks().onSeek(1);
    expect(video.pendingSeek).toBeNull();
    expect(video.state.restartingLoop).toBe(false);
    expect(callbacks().playing).toBe(true);
  });

  it('does not replay an ended loop until the newest seek actually reaches its target', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();
    changeProps({ loop: { startTime: 1000, duration: 9000 }, offset: 10000 });
    dispatch.mockClear();
    callbacks().onEnded();
    changeProps({ offset: 1000, seekRevision: 1 });

    media.time = 10;
    callbacks().onSeek(10); // Delayed seek completion from the previous position.
    expect(video.state.restartingLoop).toBe(true);
    expect(callbacks().playing).toBe(false);

    media.time = 1;
    callbacks().onProgress(); // Some browsers report progress before `seeked`.
    expect(video.state.restartingLoop).toBe(false);
    expect(callbacks().playing).toBe(true);
  });

  it('recovers from native end even when an earlier seek target was unreachable', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();
    changeProps({ loop: { startTime: 1000, duration: 9000 }, offset: 9500, seekRevision: 1 });
    media.time = 8; // Media ended short of the requested target.
    dispatch.mockClear();
    callbacks().onProgress();
    expect(video.pendingSeek).toEqual({ revision: 1, target: 9.5 });
    expect(dispatch).not.toHaveBeenCalled();

    callbacks().onEnded(); // Must not be blocked by the previous seek acknowledgment.
    expect(dispatch).toHaveBeenCalledWith(seek(1000));
    expect(callbacks().playing).toBe(false);

    changeProps({ offset: 1000, seekRevision: 2 });
    media.time = 1;
    callbacks().onSeek(1);
    expect(video.pendingSeek).toBeNull();
    expect(callbacks().playing).toBe(true);
  });

  it('does not issue duplicate loop restarts for repeated native ended events', () => {
    const { video, callbacks, changeProps, dispatch } = playerFixture();
    changeProps({ loop: { startTime: 0, duration: 1000 } });
    dispatch.mockClear();
    callbacks().onEnded();
    callbacks().onEnded();
    expect(video.state.restartingLoop).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(seek(0));
  });

  it('does not restart an ended video when playback was intentionally paused', () => {
    const { callbacks, changeProps, dispatch } = playerFixture();
    changeProps({ loop: { startTime: 0, duration: 1000 }, desiredPlaySpeed: 0 });
    dispatch.mockClear();
    callbacks().onEnded();
    expect(dispatch).not.toHaveBeenCalled();
    expect(callbacks().playing).toBe(false);
  });

  it('reflects natural video completion as paused when no loop is selected', () => {
    const { callbacks, dispatch } = playerFixture();
    callbacks().onEnded();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ACTION_PAUSE' }));
  });

  it('automatically retries a transient HLS network failure on reconnect at 4x', () => {
    const { video, media, callbacks, changeProps, playerElement, dispatch } = playerFixture();
    video.componentDidMount();
    try {
      changeProps({ offset: 42000, seekRevision: 1, desiredPlaySpeed: 4 });
      const oldPlayer = callbacks();
      const oldKey = playerElement().key;
      oldPlayer.onError('hlsError', { fatal: true, type: 'networkError' });
      expect(video.state.videoError).toBeTruthy();
      expect(callbacks().playing).toBe(false);

      window.dispatchEvent(new Event('online'));
      expect(video.state.videoError).toBeNull();
      expect(playerElement().key).not.toBe(oldKey);
      expect(callbacks().playbackRate).toBe(4);
      expect(callbacks().playing).toBe(true);
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: ACTION_BUFFER_VIDEO, buffering: true }));

      media.time = 0;
      callbacks().onReady(media);
      expect(media.seekTo).toHaveBeenLastCalledWith(42, 'seconds');
      oldPlayer.onError('hlsError', { fatal: true, type: 'networkError' });
      expect(video.state.videoError).toBeNull();
    } finally {
      video.componentWillUnmount();
    }
  });

  it('restores the video on reconnect but preserves intentional pause', () => {
    const { video, callbacks, changeProps } = playerFixture();
    changeProps({ offset: 8000, seekRevision: 1, desiredPlaySpeed: 0 });
    callbacks().onError('hlsError', { fatal: true, type: 'networkError' });
    video.onReconnect();
    expect(video.state.videoError).toBeNull();
    expect(callbacks().playing).toBe(false);
    expect(video.props.offset).toBe(8000);
  });

  it('never auto-retries permanent HTTP errors on reconnect', () => {
    for (const code of [401, 403, 404]) {
      const { video, callbacks, playerElement } = playerFixture();
      const originalKey = playerElement().key;
      callbacks().onError('hlsError', { fatal: true, type: 'networkError', response: { code } });
      expect(video.state.videoError).toBeTruthy();
      video.onReconnect();
      expect(video.state.videoError).toBeTruthy();
      expect(playerElement().key).toBe(originalKey);
    }
  });

  it('cancels pending reconnect recovery on route changes, manual retry and unmount', () => {
    const { video, callbacks, changeProps, playerElement } = playerFixture();
    callbacks().onError('hlsError', { fatal: true, type: 'networkError' });
    changeProps({ currentRoute: route('route-B') });
    const routeKey = playerElement().key;
    video.onReconnect();
    expect(playerElement().key).toBe(routeKey);

    callbacks().onError('hlsError', { fatal: true, type: 'networkError' });
    video.retryVideo();
    const retriedKey = playerElement().key;
    video.onReconnect();
    expect(playerElement().key).toBe(retriedKey);

    callbacks().onError('hlsError', { fatal: true, type: 'networkError' });
    video.componentWillUnmount();
    video.onReconnect();
    expect(playerElement().key).toBe(retriedKey);
  });

  it.each([
    { audioTracks: [{ name: 'mic' }], levels: [] },
    { audioTracks: [], levels: [{ audioCodec: 'mp4a.40.2' }] },
  ])('detects audio metadata that arrives before onReady (%#)', ({ audioTracks, levels }) => {
    const { media, callbacks, audio } = playerFixture();
    const hls = { audioTracks, levels, on: vi.fn(), off: vi.fn() };
    media.getInternalPlayer.mockReturnValue(hls);
    callbacks().onReady(media);
    expect(audio).toHaveBeenLastCalledWith(true);
  });

  it('clears stale audio and ignores codec callbacks from a previous route', () => {
    const { media, callbacks, changeProps, audio } = playerFixture();
    let oldCodec;
    const hls = {
      audioTracks: [], levels: [],
      on: vi.fn((_event, handler) => { oldCodec = handler; }),
      off: vi.fn(),
    };
    media.getInternalPlayer.mockReturnValue(hls);
    callbacks().onReady(media);
    oldCodec(null, { audio: { codec: 'mp4a.40.2' } });
    expect(audio).toHaveBeenLastCalledWith(true);
    changeProps({ currentRoute: route('route-B') });
    expect(audio).toHaveBeenLastCalledWith(false);
    expect(hls.off).toHaveBeenCalledWith('hlsBufferCodecs', oldCodec);
    const calls = audio.mock.calls.length;
    oldCodec(null, { audio: { codec: 'mp4a.40.2' } });
    expect(audio).toHaveBeenCalledTimes(calls);
  });

  it('resets audio availability when retry replaces the media player', () => {
    const { video, media, callbacks, audio } = playerFixture();
    media.getInternalPlayer.mockReturnValue({ audioTracks: [{ name: 'mic' }], levels: [], on: vi.fn(), off: vi.fn() });
    callbacks().onReady(media);
    expect(audio).toHaveBeenLastCalledWith(true);
    video.retryVideo();
    expect(audio).toHaveBeenLastCalledWith(false);
  });

  it('updates native iOS audio-track availability and removes track listeners on route change', () => {
    vi.mocked(isIos).mockReturnValue(true);
    try {
      const { media, callbacks, changeProps, audio } = playerFixture();
      const handlers = {};
      const tracks = {
        length: 0,
        addEventListener: vi.fn((name, handler) => { handlers[name] = handler; }),
        removeEventListener: vi.fn(),
      };
      media.getInternalPlayer.mockReturnValue({ audioTracks: tracks });
      callbacks().onReady(media);
      expect(audio).toHaveBeenLastCalledWith(false);
      tracks.length = 1;
      handlers.addtrack();
      expect(audio).toHaveBeenLastCalledWith(true);
      tracks.length = 0;
      handlers.removetrack();
      expect(audio).toHaveBeenLastCalledWith(false);
      changeProps({ currentRoute: route('route-B') });
      expect(tracks.removeEventListener).toHaveBeenCalledWith('addtrack', handlers.addtrack);
      expect(tracks.removeEventListener).toHaveBeenCalledWith('removetrack', handlers.removetrack);
      const calls = audio.mock.calls.length;
      tracks.length = 1;
      handlers.addtrack();
      expect(audio).toHaveBeenCalledTimes(calls);
    } finally {
      vi.mocked(isIos).mockReturnValue(false);
    }
  });

  it('ignores stale ended events from previous players', () => {
    const { callbacks, changeProps, dispatch } = playerFixture();
    const oldEnded = callbacks().onEnded;
    changeProps({ loop: { startTime: 0, duration: 1000 }, currentRoute: route('route-B') });
    dispatch.mockClear();
    oldEnded();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('pauses without setting the playback rate to zero', () => {
    const { callbacks, changeProps } = playerFixture();

    changeProps({ desiredPlaySpeed: 4 });
    expect(callbacks().playbackRate).toBe(4);

    changeProps({ desiredPlaySpeed: 0 });
    expect(callbacks().playing).toBe(false);
    expect(callbacks().playbackRate).toBe(4);
  });
  it('does not accept an unsolicited clock reset while buffering', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();

    changeProps({ offset: 55000, seekRevision: 1 });
    media.time = 55;
    callbacks().onSeek(55);
    dispatch.mockClear();

    callbacks().onBuffer();
    media.time = 0;
    callbacks().onProgress();

    expect(video.pendingSeek).toEqual({ revision: 1, target: 55 });
    expect(dispatch.mock.calls.some(
      ([action]) => action.type === ACTION_VIDEO_PROGRESS && action.offset === 0,
    )).toBe(false);
  });

  it('restores playback position after buffer-end reports a decoder reset', () => {
    const { video, media, callbacks, changeProps, dispatch } = playerFixture();

    changeProps({ offset: 55000, seekRevision: 1 });
    media.time = 55;
    callbacks().onSeek(55);
    dispatch.mockClear();

    callbacks().onBuffer();
    media.time = 0;
    callbacks().onBufferEnd();

    expect(media.seekTo).toHaveBeenLastCalledWith(55, 'seconds');
    expect(video.pendingSeek).toEqual({ revision: 1, target: 55 });
    expect(dispatch.mock.calls.some(
      ([action]) => action.type === ACTION_VIDEO_PROGRESS && action.offset === 0,
    )).toBe(false);

    media.time = 55;
    callbacks().onSeek(55);

    expect(video.pendingSeek).toBeNull();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: ACTION_VIDEO_PROGRESS, offset: 55000, seekRevision: 1,
    }));
  });

});
