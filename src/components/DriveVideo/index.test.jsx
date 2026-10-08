import { DriveVideo } from '.';
import * as Types from '../../actions/types';

function fixture(overrides = {}, mediaOverrides = {}) {
  const props = { currentRoute: { fullname: 'route', videoStartOffset: 1000 }, offset: 4000, desiredPlaySpeed: 1, seekRevision: 0, dispatch: vi.fn(), onAudioStatusChange: vi.fn(), ...overrides };
  const player = new DriveVideo(props);
  player.setState = (update) => { player.state = { ...player.state, ...(typeof update === 'function' ? update(player.state) : update) }; };
  const media = new EventTarget();
  Object.assign(media, { currentTime: 0, duration: 30, readyState: 2, seeking: false, paused: false, playbackRate: 1 }, mediaOverrides);
  const wrapper = { getInternalPlayer: (kind) => kind ? null : media };
  player.videoPlayer.current = wrapper;
  player.onReady(wrapper, 'route', 0);
  media.dispatchEvent(new Event('seeked'));
  props.dispatch.mockClear();
  return { player, props, media, wrapper };
}

describe('DriveVideo media events', () => {
  it('initial seek uses the video offset and observations never seek', () => {
    const { media, props } = fixture();
    expect(media.currentTime).toBe(3);
    media.currentTime = 5;
    media.dispatchEvent(new Event('timeupdate'));
    expect(props.dispatch).toHaveBeenCalledWith({ type: Types.ACTION_VIDEO_PROGRESS, route: 'route', offset: 6000, seekRevision: 0 });
    expect(media.currentTime).toBe(5);
  });

  it('applies every rapid seek and suppresses progress until seeked', () => {
    const { player, props, media } = fixture();
    media.seeking = true;
    player.props = { ...props, offset: 9000, seekRevision: 1 };
    player.componentDidUpdate(props);
    const previous = player.props;
    player.props = { ...previous, offset: 2000, seekRevision: 2 };
    player.componentDidUpdate(previous);
    expect(media.currentTime).toBe(1);
    props.dispatch.mockClear();
    media.dispatchEvent(new Event('timeupdate'));
    expect(props.dispatch).not.toHaveBeenCalled();
    media.seeking = false;
    media.dispatchEvent(new Event('seeked'));
    expect(props.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_VIDEO_PROGRESS, offset: 2000, seekRevision: 2 }));
  });

  it('waiting freezes state and seeked clears buffering at readyState 2', () => {
    const { props, media } = fixture();
    media.dispatchEvent(new Event('waiting'));
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_BUFFER_VIDEO, buffering: true });
    media.dispatchEvent(new Event('seeked'));
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_BUFFER_VIDEO, buffering: false });
  });

  it('loops at zero and ends without a loop', () => {
    const { player, props, media } = fixture({ currentRoute: { fullname: 'route' }, offset: 0, loop: { startTime: 0, duration: 2000 } });
    media.currentTime = 2;
    media.dispatchEvent(new Event('timeupdate'));
    expect(props.dispatch).toHaveBeenCalledWith({ type: Types.ACTION_SEEK, offset: 0, loop: true });
    player.props = { ...props, loop: null };
    media.dispatchEvent(new Event('ended'));
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_PAUSE });
  });

  it('queues the latest seek until metadata and waits for the actual seek target', () => {
    const { player, props, media } = fixture();
    media.readyState = 0;
    player.props = { ...props, offset: 12000, seekRevision: 1 };
    player.componentDidUpdate(props);
    expect(media.currentTime).toBe(3);
    media.readyState = 2;
    media.dispatchEvent(new Event('loadedmetadata'));
    expect(media.currentTime).toBe(11);
    props.dispatch.mockClear();
    media.currentTime = 3; // delayed observation from the previous position
    media.dispatchEvent(new Event('seeked'));
    expect(media.currentTime).toBe(11); // Reapply the latest command.
    media.dispatchEvent(new Event('timeupdate'));
    expect(props.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_VIDEO_PROGRESS }));
    media.currentTime = 11;
    media.dispatchEvent(new Event('seeked'));
    expect(props.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_VIDEO_PROGRESS, offset: 12000 }));
  });

  it('detects native audio arriving later and removes its listener on unmount', () => {
    const audioTracks = new EventTarget();
    audioTracks.length = 0;
    const { player, props, media } = fixture({}, { audioTracks });
    media.audioTracks.length = 1;
    media.audioTracks.dispatchEvent(new Event('addtrack'));
    expect(props.onAudioStatusChange).toHaveBeenLastCalledWith(true);
    player.componentWillUnmount();
    props.onAudioStatusChange.mockClear();
    media.audioTracks.dispatchEvent(new Event('addtrack'));
    expect(props.onAudioStatusChange).not.toHaveBeenCalled();
  });

  it('shows a failed video as paused and resumes at the previous speed on retry', () => {
    const { player, props, media } = fixture({ desiredPlaySpeed: 2 });
    player.onError('hlsError', { fatal: true }, 'route', 0);
    expect(props.dispatch).toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
    player.props = { ...props, desiredPlaySpeed: 0 };
    props.dispatch.mockClear();
    media.dispatchEvent(new Event('timeupdate'));
    expect(props.dispatch).not.toHaveBeenCalled();
    player.retry();
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_PLAY, speed: 2 });
  });

  it('retries when the viewer presses play on a failed video', () => {
    const { player, props } = fixture();
    player.onError('hlsError', { fatal: true }, 'route', 0);
    const paused = { ...props, desiredPlaySpeed: 0 };
    player.props = { ...props, desiredPlaySpeed: 1 };
    player.componentDidUpdate(paused);
    expect(player.state).toMatchObject({ videoError: null, retry: 1 });
  });

  it('stays paused after retry if the viewer had paused before the failure', () => {
    const { player, props } = fixture({ desiredPlaySpeed: 0 });
    player.onError('hlsError', { fatal: true }, 'route', 0);
    props.dispatch.mockClear();
    player.retry();
    expect(props.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_PLAY }));
  });

  it.each([401, 403])('explains an expired stream link (HTTP %i) instead of blaming the connection', (code) => {
    const { player } = fixture();
    player.onError('hlsError', { fatal: true, response: { code } }, 'route', 0);
    expect(player.state.videoError).toContain('expired');
  });

  it('rejects an old player ready callback even for the same route', () => {
    const { player, media } = fixture();
    player.onReady({ getInternalPlayer: () => new EventTarget() }, 'route', 0);
    expect(player.media).toBe(media);
  });

  it('restarts a loop at natural video end even if route logs extend beyond video', () => {
    const { player, props, media } = fixture({ currentRoute: { fullname: 'route' }, offset: 0, loop: { startTime: 0, duration: 5000 } });
    media.duration = 2;
    media.currentTime = 2;
    media.ended = true;
    media.play = vi.fn(() => Promise.resolve());
    media.dispatchEvent(new Event('ended'));
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_SEEK, offset: 0, loop: true });
    player.props = { ...props, seekRevision: 1 };
    player.componentDidUpdate(props);
    expect(media.currentTime).toBe(0);
    expect(media.play).toHaveBeenCalledOnce();
  });

  it('ignores old route callbacks and detaches listeners', () => {
    const { player, props, media, wrapper } = fixture();
    player.props = { ...props, currentRoute: { fullname: 'new route' } };
    player.componentDidUpdate(props);
    props.dispatch.mockClear();
    media.dispatchEvent(new Event('timeupdate'));
    player.onReady(wrapper, 'route', 0);
    player.onError('hlsError', { fatal: true }, 'route', 0);
    expect(props.dispatch).not.toHaveBeenCalled();
    expect(player.media).toBeNull();
  });

  it('ignores nonfatal HLS errors, offers retry after fatal errors, and handles autoplay rejection', () => {
    const { player, props, media } = fixture();
    player.onError('hlsError', { fatal: false }, 'route', 0);
    expect(player.state.videoError).toBeNull();
    player.onError('hlsError', { fatal: true, response: { code: 404 } }, 'route', 0);
    expect(player.state.videoError).toContain('deleted');
    player.retry();
    expect(player.state.videoError).toBeNull();
    expect(player.state.retry).toBe(1);
    media.paused = true;
    player.onError({ name: 'NotAllowedError' }, null, 'route', 1);
    expect(props.dispatch).toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
    expect(player.state.videoError).toBeNull();
  });

  it('publishes the final frame and reflects a native pause, including during a seek', () => {
    const { player, props, media } = fixture();
    media.currentTime = 6;
    media.paused = true;
    media.dispatchEvent(new Event('pause'));
    expect(props.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_VIDEO_PROGRESS, offset: 7000 }));
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_PAUSE });
    props.dispatch.mockClear();
    player.pendingSeek = true;
    media.dispatchEvent(new Event('pause'));
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_PAUSE });
  });

  it('reflects native resume without letting delayed playing events undo a pause', () => {
    const { props, media } = fixture({ desiredPlaySpeed: 0 });
    media.playbackRate = 2;
    media.dispatchEvent(new Event('playing'));
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_PLAY, speed: 2 });
    props.dispatch.mockClear();
    media.paused = true;
    media.dispatchEvent(new Event('playing'));
    expect(props.dispatch).not.toHaveBeenCalled();
  });

  it('does not loop a paused video or accept a stale autoplay rejection', () => {
    const { player, props, media } = fixture({ loop: { startTime: 0, duration: 2000 }, offset: 0 });
    player.onError({ name: 'NotAllowedError' }, null, 'route', 0);
    expect(props.dispatch).not.toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
    media.paused = true;
    media.currentTime = 2;
    media.dispatchEvent(new Event('timeupdate'));
    expect(props.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_SEEK }));
    player.props = { ...props, desiredPlaySpeed: 0 };
    props.dispatch.mockClear();
    media.dispatchEvent(new Event('ended'));
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_PAUSE });
  });

  it('detects decoded native audio only once when audioTracks is unavailable', () => {
    const { props, media } = fixture();
    media.webkitAudioDecodedByteCount = 1;
    media.dispatchEvent(new Event('timeupdate'));
    media.dispatchEvent(new Event('timeupdate'));
    expect(props.onAudioStatusChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('detects HLS audio already discovered before ready and ignores detached codec events', () => {
    const { player, props, wrapper } = fixture();
    const hls = { levels: [{ audioCodec: 'mp4a.40.2' }], on: vi.fn(), off: vi.fn() };
    // Preserve the element: onReady detaches the previous owner first.
    const media = player.media;
    wrapper.getInternalPlayer = (kind) => kind ? hls : media;
    player.detachMedia();
    player.onReady(wrapper, 'route', 0);
    expect(props.onAudioStatusChange).toHaveBeenCalledExactlyOnceWith(true);
    const listener = hls.on.mock.calls[0][1];
    listener('hlsBufferCodecs', { video: {} });
    expect(props.onAudioStatusChange).toHaveBeenCalledTimes(1);
    player.componentWillUnmount();
    expect(hls.off).toHaveBeenCalledWith('hlsBufferCodecs', listener);
    props.onAudioStatusChange.mockClear();
    listener('hlsBufferCodecs', { audio: {} });
    expect(props.onAudioStatusChange).not.toHaveBeenCalled();
  });

  it('detaches the old element when credentials change for the same route', () => {
    const { player, props, media } = fixture();
    player.props = { ...props, currentRoute: { ...props.currentRoute, share_sig: 'new signature' } };
    player.componentDidUpdate(props);
    props.dispatch.mockClear();
    media.dispatchEvent(new Event('waiting'));
    media.dispatchEvent(new Event('pause'));
    expect(props.dispatch).not.toHaveBeenCalled();
    expect(player.media).toBeNull();
    expect(props.onAudioStatusChange).toHaveBeenLastCalledWith(false);
  });

  it('realigns media when first-frame metadata arrives late', () => {
    const { player, props, media } = fixture();
    player.props = { ...props, currentRoute: { ...props.currentRoute, videoStartOffset: 2000 } };
    player.componentDidUpdate(props);
    expect(media.currentTime).toBe(2);
  });

  it('keeps a fatal error terminal until retry even if late media events arrive', () => {
    const { player, props, media } = fixture();
    player.onError('hlsError', { fatal: true }, 'route', 0);
    props.dispatch.mockClear();
    for (const event of ['waiting', 'canplay', 'playing', 'pause', 'ended']) media.dispatchEvent(new Event(event));
    expect(props.dispatch).not.toHaveBeenCalled();
  });

  it('does not clear buffering while a newer seek is pending', () => {
    const { player, props, media } = fixture();
    player.pendingSeek = true;
    media.dispatchEvent(new Event('playing'));
    media.dispatchEvent(new Event('canplay'));
    expect(props.dispatch).not.toHaveBeenCalledWith({ type: Types.ACTION_BUFFER_VIDEO, buffering: false });
  });

  it('offers retry if a decoder repeatedly completes a seek at the wrong position', () => {
    const { player, media } = fixture();
    player.seekMedia();
    player.pendingSeek = true;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      media.currentTime = 0;
      media.dispatchEvent(new Event('seeked'));
    }
    expect(player.state.videoError).toContain('try again');
  });

  it('publishes every presented frame, restarts clips on the boundary frame, and stops on detach', () => {
    let frame;
    const media = { requestVideoFrameCallback: vi.fn((callback) => { frame = callback; return 7; }), cancelVideoFrameCallback: vi.fn() };
    const { player, props } = fixture({ currentRoute: { fullname: 'route' }, offset: 0, loop: { startTime: 0, duration: 2000 } }, media);
    player.media.currentTime = 1.5;
    frame();
    expect(props.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: Types.ACTION_VIDEO_PROGRESS, offset: 1500 }));
    player.media.currentTime = 2;
    frame();
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_SEEK, offset: 0, loop: true });
    player.componentWillUnmount();
    expect(media.cancelVideoFrameCallback).toHaveBeenCalledWith(7);
  });

  it('accepts a seek that hls.js completes just past a gap between fragments', () => {
    const { player, props, media } = fixture();
    player.props = { ...props, offset: 9000, seekRevision: 1 };
    player.componentDidUpdate(props);
    expect(player.pendingSeek).toBe(true);
    // Fragments start ~21ms after their nominal time; hls.js skips the hole.
    media.currentTime = 8.100291;
    media.dispatchEvent(new Event('seeked'));
    expect(media.currentTime).toBe(8.100291);
    expect(player.state.videoError).toBeNull();
    expect(props.dispatch).toHaveBeenCalledWith({ type: Types.ACTION_BUFFER_VIDEO, buffering: false });
  });

  it('does not re-seek or reset pending commands when native canplay reports ready again', () => {
    const { player, props, media, wrapper } = fixture();
    media.currentTime = 6;
    player.pendingSeek = true;
    player.seekAttempts = 2;
    player.onReady(wrapper, 'route', 0);
    expect(media.currentTime).toBe(6);
    expect(player.pendingSeek).toBe(true);
    expect(player.seekAttempts).toBe(2);
    expect(props.dispatch).not.toHaveBeenCalled();
  });
});
