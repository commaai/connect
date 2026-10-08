import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { api } from '../../api/backend';
import { bufferVideo, pause, updateVideoTime } from '../../timeline/playback';
import { DriveVideo } from './index';

const playerMock = vi.hoisted(() => ({ props: null, hls: null, mountCount: 0 }));

vi.mock('react-player/file', async () => {
  const ReactPlayerReact = await import('react');
  return {
    default: ReactPlayerReact.forwardRef((playerProps, ref) => {
      const mediaRef = ReactPlayerReact.useRef(null);
      ReactPlayerReact.useImperativeHandle(ref, () => ({
        getInternalPlayer: (key) => (key ? playerMock.hls : mediaRef.current),
      }));
      ReactPlayerReact.useEffect(() => {
        playerMock.props = playerProps;
        playerMock.mountCount += 1;
        playerProps.onReady?.();
      }, [playerProps.url]);
      return <video ref={mediaRef} data-testid="video" muted={playerProps.muted} />;
    }),
  };
});

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: vi.fn(() => 'https://video.example/route.m3u8') } },
}));
vi.mock('../../timeline', () => ({
  currentOffset: (state) => state.offset + (Date.now() - state.startTime) * state.desiredPlaySpeed,
}));

class MockHls {
  static Events = {
    ERROR: 'hlsError',
    BUFFER_CODECS: 'bufferCodecs',
  };

  on = vi.fn();
  off = vi.fn();
  recoverMediaError = vi.fn();
}

const route = {
  duration: 20000,
  fullname: 'device|route',
  videoStartOffset: 5000,
};

const routeWithoutAudioOffset = {
  ...route,
  fullname: 'device|route-without-offset',
  videoStartOffset: null,
};

function makeProps(overrides = {}) {
  return {
    currentRoute: route,
    desiredPlaySpeed: 1,
    dispatch: vi.fn(),
    isBufferingVideo: false,
    isMuted: true,
    loop: null,
    offset: 0,
    seekRevision: 0,
    startTime: Date.now(),
    ...overrides,
  };
}

describe('DriveVideo', () => {
  beforeEach(() => {
    playerMock.props = null;
    playerMock.hls = null;
    playerMock.mountCount = 0;
  });

  it('reports the native video playhead as a route offset', () => {
    const driveVideoProps = makeProps();
    render(<DriveVideo {...driveVideoProps} />);
    const media = screen.getByTestId('video');
    media.currentTime = 2.5;

    fireEvent.timeUpdate(media);

    expect(driveVideoProps.dispatch).toHaveBeenCalledWith(updateVideoTime(7500));
  });

  it('applies explicit timeline seeks to the media element', () => {
    const driveVideoProps = makeProps({ desiredPlaySpeed: 0 });
    const { rerender } = render(<DriveVideo {...driveVideoProps} />);
    const media = screen.getByTestId('video');
    Object.defineProperty(media, 'readyState', { configurable: true, value: 1 });
    Object.defineProperty(media, 'duration', { configurable: true, value: 20 });

    rerender(<DriveVideo {...driveVideoProps} offset={8000} seekRevision={1} />);

    expect(media.currentTime).toBe(3);
    expect(api.video.getQcameraStreamUrl).toHaveBeenCalledWith(route.fullname, undefined, undefined);
  });

  it('holds a seek until media metadata is available', () => {
    const driveVideoProps = makeProps({ desiredPlaySpeed: 0, offset: 8000 });
    const { rerender } = render(<DriveVideo {...driveVideoProps} />);
    const media = screen.getByTestId('video');
    Object.defineProperty(media, 'readyState', { configurable: true, value: 0 });

    rerender(<DriveVideo {...driveVideoProps} seekRevision={1} />);
    expect(media.currentTime).toBe(0);

    Object.defineProperty(media, 'readyState', { configurable: true, value: 1 });
    fireEvent.loadedMetadata(media);

    expect(media.currentTime).toBe(3);
  });

  it('sets buffering from media waiting and playing events', () => {
    const driveVideoProps = makeProps();
    render(<DriveVideo {...driveVideoProps} />);
    const media = screen.getByTestId('video');
    media.currentTime = 4;

    fireEvent.waiting(media);
    expect(driveVideoProps.dispatch).toHaveBeenCalledWith(updateVideoTime(9000));
    expect(driveVideoProps.dispatch).toHaveBeenCalledWith(bufferVideo(true));

    fireEvent.playing(media);
    expect(driveVideoProps.dispatch).toHaveBeenCalledWith(bufferVideo(false));
  });

  it('pauses at route end and updates the timeline', () => {
    const driveVideoProps = makeProps();
    render(<DriveVideo {...driveVideoProps} />);

    fireEvent.ended(screen.getByTestId('video'));

    expect(driveVideoProps.dispatch).toHaveBeenCalledWith(updateVideoTime(route.duration));
    expect(driveVideoProps.dispatch).toHaveBeenCalledWith(pause());
  });

  it('reports audio-track availability when metadata is loaded', () => {
    const onAudioStatusChange = vi.fn();
    const driveVideoProps = makeProps({ onAudioStatusChange });
    render(<DriveVideo {...driveVideoProps} />);
    const media = screen.getByTestId('video');
    Object.defineProperty(media, 'audioTracks', { configurable: true, value: { length: 1 } });

    fireEvent.loadedMetadata(media);

    expect(onAudioStatusChange).toHaveBeenCalledWith(true);
  });

  it('uses HLS codec events to report audio availability', () => {
    const onAudioStatusChange = vi.fn();
    const hls = new MockHls();
    playerMock.hls = hls;
    render(<DriveVideo {...makeProps({ onAudioStatusChange })} />);

    expect(hls.on).toHaveBeenCalledWith('bufferCodecs', expect.any(Function));
    const audioEvent = hls.on.mock.calls.find(([name]) => name === 'bufferCodecs')[1];
    audioEvent('bufferCodecs', { audio: { codec: 'mp4a.40.2' } });

    expect(onAudioStatusChange).toHaveBeenCalledWith(true);
  });

  it('recovers once from a fatal HLS media error and presents a retry for network failures', async () => {
    const hls = new MockHls();
    playerMock.hls = hls;
    render(<DriveVideo {...makeProps()} />);

    act(() => playerMock.props.onError('hlsError', { fatal: true, type: 'mediaError' }));
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

    act(() => playerMock.props.onError('hlsError', { fatal: true, type: 'networkError' }));
    expect(await screen.findByText('Unable to load video. Check network connection.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(playerMock.mountCount).toBe(2));
  });

  it('shows a missing-segment message for HLS 404 errors', () => {
    render(<DriveVideo {...makeProps()} />);

    act(() => {
      playerMock.props.onError('hlsError', {
        fatal: true,
        type: 'networkError',
        response: { code: 404 },
      });
    });

    expect(screen.getByText('This video segment has not uploaded yet or has been deleted.')).toBeInTheDocument();
  });

  it('offers an explicit play action when autoplay is blocked', () => {
    const driveVideoProps = makeProps();
    render(<DriveVideo {...driveVideoProps} />);
    const media = screen.getByTestId('video');
    media.play = vi.fn().mockResolvedValue(undefined);

    act(() => playerMock.props.onError(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
    expect(screen.getByText('Playback was blocked by your browser. Tap below to start the video.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    expect(media.play).toHaveBeenCalledTimes(1);
  });

  it('replaces the stream on route changes and clears a previous video error', async () => {
    const driveVideoProps = makeProps({ desiredPlaySpeed: 0 });
    const { rerender } = render(<DriveVideo {...driveVideoProps} />);
    act(() => playerMock.props.onError(new Error('decode failed')));
    expect(screen.getByText('Unable to play this video.')).toBeInTheDocument();

    const nextProps = {
      ...driveVideoProps,
      currentRoute: routeWithoutAudioOffset,
    };
    rerender(<DriveVideo {...nextProps} />);

    await waitFor(() => {
      expect(api.video.getQcameraStreamUrl).toHaveBeenLastCalledWith(
        routeWithoutAudioOffset.fullname,
        undefined,
        undefined,
      );
    });
    expect(screen.queryByText('Unable to play this video.')).not.toBeInTheDocument();
    expect(driveVideoProps.dispatch).toHaveBeenCalledWith(bufferVideo(true));
  });

  it('detaches media and HLS event listeners on unmount', () => {
    const hls = new MockHls();
    playerMock.hls = hls;
    const { unmount } = render(<DriveVideo {...makeProps()} />);
    const media = screen.getByTestId('video');
    const removeListener = vi.spyOn(media, 'removeEventListener');

    unmount();

    expect(removeListener).toHaveBeenCalledWith('timeupdate', expect.any(Function));
    expect(hls.off).toHaveBeenCalledWith('hlsError', expect.any(Function));
    expect(hls.off).toHaveBeenCalledWith('bufferCodecs', expect.any(Function));
  });
});
