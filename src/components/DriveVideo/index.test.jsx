import { DriveVideo } from '.';
import * as Types from '../../actions/types';

function fixture(overrides = {}) {
  const props = { currentRoute: { fullname: 'route', videoStartOffset: 1000 }, offset: 4000, desiredPlaySpeed: 1, seekRevision: 0, dispatch: vi.fn(), onAudioStatusChange: vi.fn(), ...overrides };
  const player = new DriveVideo(props);
  player.setState = (update) => { player.state = { ...player.state, ...(typeof update === 'function' ? update(player.state) : update) }; };
  const media = new EventTarget();
  Object.assign(media, { currentTime: 0, duration: 30, readyState: 2, seeking: false });
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
    expect(props.dispatch).toHaveBeenCalledWith({ type: Types.ACTION_SEEK, offset: 0 });
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
    media.dispatchEvent(new Event('timeupdate'));
    expect(props.dispatch).not.toHaveBeenCalled();
    media.currentTime = 11;
    media.dispatchEvent(new Event('seeked'));
    expect(props.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_VIDEO_PROGRESS, offset: 12000 }));
  });

  it('detects native audio arriving later and removes its listener on unmount', () => {
    const { player, props, media, wrapper } = fixture();
    media.audioTracks = new EventTarget();
    media.audioTracks.length = 0;
    player.onReady(wrapper, 'route', 0);
    media.audioTracks.length = 1;
    media.audioTracks.dispatchEvent(new Event('addtrack'));
    expect(props.onAudioStatusChange).toHaveBeenLastCalledWith(true);
    player.componentWillUnmount();
    props.onAudioStatusChange.mockClear();
    media.audioTracks.dispatchEvent(new Event('addtrack'));
    expect(props.onAudioStatusChange).not.toHaveBeenCalled();
  });

  it('retains requested speed across fatal errors and retry', () => {
    const { player, props, media } = fixture({ desiredPlaySpeed: 2 });
    player.onError('hlsError', { fatal: true }, 'route', 0);
    expect(props.dispatch).not.toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
    props.dispatch.mockClear();
    media.dispatchEvent(new Event('timeupdate'));
    expect(props.dispatch).not.toHaveBeenCalled();
    player.retry();
    expect(player.props.desiredPlaySpeed).toBe(2);
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
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_SEEK, offset: 0 });
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
    const { player, props } = fixture();
    player.onError('hlsError', { fatal: false }, 'route', 0);
    expect(player.state.videoError).toBeNull();
    player.onError('hlsError', { fatal: true, response: { code: 404 } }, 'route', 0);
    expect(player.state.videoError).toContain('deleted');
    player.retry();
    expect(player.state.videoError).toBeNull();
    expect(player.state.retry).toBe(1);
    player.onError({ name: 'NotAllowedError' }, null, 'route', 1);
    expect(props.dispatch).toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
    expect(player.state.videoError).toBeNull();
  });
});
