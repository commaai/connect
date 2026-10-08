import React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { reducer as playbackReducer, bufferVideo, play, seek, selectLoop } from '../../timeline/playback';
import DriveVideo from '.';

const mocks = vi.hoisted(() => ({
  playerProps: null,
  duration: 0,
  currentTime: 0,
  seekCalls: [],
  hls: { on: vi.fn(), off: vi.fn() },
  tracks: { length: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  videoElement: { play: vi.fn(() => Promise.resolve()) },
  player: null,
}));

mocks.player = {
  getDuration: () => mocks.duration,
  getCurrentTime: () => mocks.currentTime,
  getInternalPlayer: (key) => key === 'hls' ? mocks.hls : { ...mocks.videoElement, audioTracks: mocks.tracks },
  seekTo: (seconds) => {
    mocks.seekCalls.push(seconds);
    mocks.currentTime = seconds;
  },
};

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: () => '/same-video.m3u8' } },
}));

vi.mock('react-player/file', () => ({
  default: React.forwardRef((props, ref) => {
    mocks.playerProps = props;
    React.useImperativeHandle(ref, () => mocks.player);
    return <div data-testid="mock-react-player" />;
  }),
}));

const firstRoute = { fullname: 'device|route-a', videoStartOffset: null };
const initialState = {
  currentRoute: firstRoute,
  desiredPlaySpeed: 0,
  isBufferingVideo: true,
  offset: 5000,
  seekRevision: 0,
  loop: { startTime: 0, duration: 30000 },
};

function reducer(state = initialState, action) {
  if (action.type === 'TEST_ROUTE') return { ...state, currentRoute: action.route };
  return playbackReducer(state, action);
}

function mount() {
  const store = createStore(reducer);
  render(<Provider store={store}><DriveVideo isMuted onAudioStatusChange={vi.fn()} /></Provider>);
  return store;
}

describe('DriveVideo follows ReactPlayer events', () => {
  beforeEach(() => {
    mocks.playerProps = null;
    mocks.duration = 0;
    mocks.currentTime = 0;
    mocks.seekCalls = [];
    mocks.videoElement.play.mockClear();
    mocks.hls.on.mockClear();
    mocks.hls.off.mockClear();
  });

  it('holds a pending seek until duration is ready and ignores progress until seeked', async () => {
    const store = mount();
    await waitFor(() => expect(mocks.playerProps?.url).toBe('/same-video.m3u8'));
    const props = mocks.playerProps;
    act(() => props.onReady(mocks.player));
    act(() => props.onProgress({ playedSeconds: 1, loadedSeconds: 1 }));
    expect(store.getState().offset).toBe(5000);
    expect(mocks.seekCalls).toEqual([]);

    mocks.duration = 60;
    act(() => props.onDuration(60));
    expect(mocks.seekCalls).toEqual([5]);
    act(() => store.dispatch(seek(0)));
    expect(mocks.seekCalls).toEqual([5, 0]);
    act(() => mocks.playerProps.onSeek(0));
    expect(store.getState().offset).toBe(0);
    expect(store.getState().isBufferingVideo).toBe(false);
  });

  it('does not clear buffering from download progress and wraps when media ends', async () => {
    const store = mount();
    await waitFor(() => expect(mocks.playerProps?.url).toBe('/same-video.m3u8'));
    mocks.duration = 30;
    act(() => mocks.playerProps.onReady(mocks.player));
    act(() => mocks.playerProps.onProgress({ playedSeconds: 5, loadedSeconds: 10 }));
    expect(store.getState().isBufferingVideo).toBe(true);
    act(() => mocks.playerProps.onBufferEnd());
    expect(store.getState().isBufferingVideo).toBe(false);
    act(() => mocks.playerProps.onSeek(5));

    act(() => store.dispatch({ type: 'TEST_ROUTE', route: { ...firstRoute, videoStartOffset: 0 } }));
    await waitFor(() => expect(mocks.playerProps?.url).toBe('/same-video.m3u8'));
    act(() => store.dispatch(bufferVideo(false)));
    const seeksBeforePausedEnd = mocks.seekCalls.length;
    act(() => mocks.playerProps.onEnded());
    expect(mocks.seekCalls).toHaveLength(seeksBeforePausedEnd);
    act(() => store.dispatch(play()));
    act(() => mocks.playerProps.onEnded());
    expect(mocks.seekCalls.at(-1)).toBe(0);
    act(() => mocks.playerProps.onSeek(0));
    expect(mocks.videoElement.play).toHaveBeenCalledOnce();
    act(() => store.dispatch(bufferVideo(true)));
    act(() => mocks.playerProps.onError({ name: 'NotAllowedError' }));
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(store.getState().isBufferingVideo).toBe(false);
    act(() => mocks.playerProps.onPlay());
    expect(store.getState().desiredPlaySpeed).toBe(1);
  });

  it('ignores stale route and retry errors and shows fatal HLS errors with a retry control', async () => {
    const store = mount();
    await waitFor(() => expect(mocks.playerProps?.url).toBe('/same-video.m3u8'));
    const staleRouteProps = mocks.playerProps;
    act(() => store.dispatch({ type: 'TEST_ROUTE', route: { fullname: 'device|route-b', videoStartOffset: null } }));
    await waitFor(() => expect(mocks.playerProps?.url).toBe('/same-video.m3u8'));
    act(() => staleRouteProps.onError('hlsError', { fatal: true, response: { code: 404 } }));
    expect(screen.queryByText(/not uploaded yet/)).not.toBeInTheDocument();

    act(() => mocks.playerProps.onError('hlsError', { fatal: false, details: 'bufferStalledError' }));
    expect(screen.queryByText(/Unable to load video/)).not.toBeInTheDocument();
    act(() => mocks.playerProps.onError('hlsError', { fatal: true, response: { code: 404 } }));
    expect(screen.getByText(/not uploaded yet/)).toBeInTheDocument();

    const staleRetryProps = mocks.playerProps;
    fireEvent.click(screen.getByRole('button', { name: 'Retry video' }));
    await waitFor(() => expect(mocks.playerProps).not.toBe(staleRetryProps));
    act(() => staleRetryProps.onError('hlsError', { fatal: true, message: 'stale error' }));
    expect(screen.queryByText('stale error')).not.toBeInTheDocument();
  });

  it('reconciles a late video start offset without issuing another seek', async () => {
    const store = mount();
    await waitFor(() => expect(mocks.playerProps?.url).toBe('/same-video.m3u8'));
    mocks.duration = 60;
    mocks.currentTime = 3;
    act(() => mocks.playerProps.onReady(mocks.player));
    act(() => mocks.playerProps.onSeek(5));
    mocks.currentTime = 3;
    mocks.seekCalls = [];
    act(() => store.dispatch({
      type: 'TEST_ROUTE', route: { ...firstRoute, videoStartOffset: 500 },
    }));
    expect(store.getState().offset).toBe(3500);
    expect(mocks.seekCalls).toEqual([]);
  });

  it('does not restart a clip when the loop starts beyond its media duration', async () => {
    const store = mount();
    await waitFor(() => expect(mocks.playerProps?.url).toBe('/same-video.m3u8'));
    mocks.duration = 30;
    act(() => mocks.playerProps.onReady(mocks.player));
    act(() => mocks.playerProps.onSeek(5));
    act(() => store.dispatch(selectLoop(40000, 60000)));
    act(() => store.dispatch(play()));
    expect(mocks.seekCalls.at(-1)).toBe(30);
    act(() => mocks.playerProps.onSeek(30));
    mocks.videoElement.play.mockClear();

    act(() => mocks.playerProps.onEnded());
    expect(mocks.videoElement.play).not.toHaveBeenCalled();
  });
});
