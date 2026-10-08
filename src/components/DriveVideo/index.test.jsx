import { vi } from 'vitest';
import * as Types from '../../actions/types';
import { DriveVideo } from './index';

vi.mock('../../store', () => ({
  default: { getState: () => ({}) },
}));

const route = {
  fullname: '2024-01-01--00-00-00',
  share_exp: null,
  share_sig: null,
  videoStartOffset: 1000,
};

function makeInstance(overrides = {}) {
  const props = {
    currentRoute: route,
    desiredPlaySpeed: 1,
    dispatch: vi.fn(),
    isBufferingVideo: false,
    isMuted: false,
    loop: null,
    offset: 2000,
    ...overrides,
  };
  const instance = new DriveVideo(props);
  instance.setState = update => {
    const nextState = typeof update === 'function' ? update(instance.state) : update;
    instance.state = { ...instance.state, ...nextState };
  };
  instance.videoPlayer.current = { seekTo: vi.fn() };
  return { instance, props };
}

describe('DriveVideo media lifecycle', () => {
  it('applies the initial seek once after the player is ready', () => {
    const { instance } = makeInstance();
    const player = { getInternalPlayer: () => ({}) };

    instance.onVideoReady(player, 0);
    instance.onVideoReady(player, 0);

    expect(instance.videoPlayer.current.seekTo).toHaveBeenCalledTimes(1);
    expect(instance.videoPlayer.current.seekTo).toHaveBeenCalledWith(1, 'seconds');
  });

  it('does not repeat an external seek to the same media time', () => {
    const { instance } = makeInstance();

    expect(instance.seekToRouteOffset(3000)).toBe(true);
    expect(instance.seekToRouteOffset(3000)).toBe(false);
    expect(instance.seekToRouteOffset(4000)).toBe(true);

    expect(instance.videoPlayer.current.seekTo).toHaveBeenCalledTimes(2);
  });

  it('drops progress events from a previous route', () => {
    const { instance, props } = makeInstance();
    instance.sourceGeneration = 2;

    instance.onVideoProgress({ playedSeconds: 2 }, 1);
    expect(props.dispatch).not.toHaveBeenCalled();

    instance.onVideoProgress({ playedSeconds: 2 }, 2);
    expect(props.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_MEDIA_TIME,
      offset: 3000,
    }));
  });

  it('wraps a completed loop at the selected start', () => {
    const { instance, props } = makeInstance({
      loop: { startTime: 3000, duration: 1000 },
    });

    instance.onVideoProgress({ playedSeconds: 3.1 }, 0);

    expect(props.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_SEEK,
      offset: 3000,
    }));
    expect(instance.videoPlayer.current.seekTo).toHaveBeenCalledWith(2, 'seconds');
  });

  it('keeps recoverable HLS stalls out of the fatal error state', () => {
    const { instance, props } = makeInstance();

    instance.onVideoError('hlsError', {
      type: 'mediaError',
      details: 'bufferStalledError',
    }, 0);

    expect(props.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_BUFFER_VIDEO,
      buffering: true,
    }));
    expect(instance.state.videoError).toBeNull();
  });

  it('reports fatal missing-video errors', () => {
    const { instance } = makeInstance();

    instance.onVideoError('hlsError', {
      type: 'networkError',
      fatal: true,
      response: { code: 404 },
    }, 0);

    expect(instance.state.videoError).toBe('This video segment has not uploaded yet or has been deleted.');
  });

  it('removes the HLS listener when the route is discarded', () => {
    const { instance } = makeInstance({ onAudioStatusChange: vi.fn() });
    const hlsPlayer = { on: vi.fn(), off: vi.fn() };
    const player = { getInternalPlayer: () => hlsPlayer };

    instance.onVideoReady(player, 0);
    instance.componentWillUnmount();

    expect(hlsPlayer.off).toHaveBeenCalledWith('hlsBufferCodecs', expect.any(Function));
  });
});
