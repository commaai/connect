import React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { act, fireEvent, render, screen } from '@testing-library/react';

import DriveVideo from '.';
import { reducer, seek } from '../../timeline/playback';

const mocks = vi.hoisted(() => ({ players: [], store: null }));
vi.mock('../../store', () => ({ default: { getState: () => mocks.store.getState() } }));
vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: () => 'https://example.com/video.m3u8' } },
}));
vi.mock('react-player/file', () => ({
  default: React.forwardRef((props, ref) => {
    const [player] = React.useState(() => {
      const video = {
        currentTime: 0, readyState: 0, paused: true, playbackRate: 1,
        buffered: { length: 0 }, pause: vi.fn(), play: vi.fn(() => Promise.resolve()),
      };
      const instance = {
        video, destroyed: false,
        getDuration: () => video.readyState ? 300 : null,
        getCurrentTime: () => video.currentTime,
        getInternalPlayer: (key) => key === 'hls' ? { on: vi.fn() } : video,
        seekTo: vi.fn((time) => { video.currentTime = time; }),
      };
      mocks.players.push(instance);
      return instance;
    });
    player.props = props;
    React.useImperativeHandle(ref, () => player);
    React.useEffect(() => () => { player.destroyed = true; }, [player]);
    return <div data-testid="player" />;
  }),
}));

const ROUTE = { fullname: 'device|route', videoStartOffset: 1000 };
const fatalNetworkError = { type: 'networkError', details: 'manifestLoadError', fatal: true };
const player = () => mocks.players.at(-1);

function renderVideo(overrides = {}) {
  mocks.store = createStore((state, action) => {
    if (action.type === 'test-route') return { ...state, currentRoute: action.route };
    return reducer(state, action);
  }, {
    currentRoute: ROUTE, offset: 31000, startTime: Date.now(),
    loop: { startTime: 1000, duration: 299000 },
    desiredPlaySpeed: 1, isBufferingVideo: true,
    ...overrides,
  });
  return render(<Provider store={mocks.store}><DriveVideo isMuted /></Provider>);
}

function loaded(instance) {
  instance.video.readyState = 4;
  instance.video.buffered = { length: 1, start: () => 0, end: () => 300 };
  act(() => instance.props.onReady(instance));
  act(() => vi.advanceTimersByTime(500));
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.players = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('video error recovery', () => {
  it.each([
    { type: 'networkError', details: 'fragLoadError', response: { code: 404 }, fatal: false },
    { type: 'mediaError', details: 'bufferStalledError', fatal: false },
  ])('lets HLS recover $details without freezing the timeline', (error) => {
    renderVideo({ isBufferingVideo: false });
    act(() => player().props.onError('hlsError', error));
    expect(screen.queryByRole('button', { name: 'Retry video' })).not.toBeInTheDocument();
    expect(mocks.store.getState().isBufferingVideo).toBe(false);
  });

  it.each([0, 2])('recreates a failed player and retains position and speed %s', (speed) => {
    renderVideo({ desiredPlaySpeed: speed });
    const failed = player();
    act(() => failed.props.onError('hlsError', fatalNetworkError));
    expect(failed.props.playing).toBe(false);
    expect(mocks.store.getState().isBufferingVideo).toBe(true);

    // A seek made while the error is visible must also survive the retry.
    act(() => mocks.store.dispatch(seek(61000)));
    fireEvent.click(screen.getByRole('button', { name: 'Retry video' }));
    const replacement = player();
    expect(replacement).not.toBe(failed);
    expect(failed.destroyed).toBe(true);
    expect(replacement.props.url).toBe(failed.props.url);
    expect(replacement.props.playing).toBe(Boolean(speed));
    expect(screen.queryByRole('button', { name: 'Retry video' })).not.toBeInTheDocument();

    loaded(replacement);
    expect(replacement.seekTo).toHaveBeenCalledWith(60, 'seconds');
    expect(mocks.store.getState().desiredPlaySpeed).toBe(speed);
    expect(mocks.store.getState().isBufferingVideo).toBe(false);
  });

  it('keeps a fatal error terminal even when old media remains buffered', () => {
    renderVideo();
    loaded(player());
    act(() => player().props.onError('hlsError', fatalNetworkError));
    act(() => vi.advanceTimersByTime(1500));
    expect(mocks.store.getState().isBufferingVideo).toBe(true);
    expect(screen.getByRole('button', { name: 'Retry video' })).toBeInTheDocument();
  });

  it('offers retry after a native media error as well as a missing HLS playlist', () => {
    renderVideo();
    act(() => player().props.onError({ target: { error: { code: 2 } } }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry video' }));
    act(() => player().props.onError('hlsError', { ...fatalNetworkError, response: { code: 404 } }));
    expect(screen.getByText('This video segment has not uploaded yet or has been deleted.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry video' })).toBeInTheDocument();
  });

  it('ignores failures arriving from a player replaced by retry or route navigation', () => {
    renderVideo();
    const failed = player();
    act(() => failed.props.onError('hlsError', fatalNetworkError));
    fireEvent.click(screen.getByRole('button', { name: 'Retry video' }));
    act(() => failed.props.onError('hlsError', fatalNetworkError));
    expect(screen.queryByRole('button', { name: 'Retry video' })).not.toBeInTheDocument();

    const previous = player();
    act(() => mocks.store.dispatch({ type: 'test-route', route: { ...ROUTE, fullname: 'device|other-route' } }));
    // Both demo routes can resolve to the same media URL; route identity still matters.
    expect(player()).not.toBe(previous);
    act(() => previous.props.onError('hlsError', fatalNetworkError));
    expect(screen.queryByRole('button', { name: 'Retry video' })).not.toBeInTheDocument();
  });

  it('can buffer before metadata without dereferencing an unloaded player', () => {
    renderVideo();
    act(() => player().props.onBuffer());
    expect(player().seekTo).not.toHaveBeenCalled();
    expect(mocks.store.getState().isBufferingVideo).toBe(true);
  });

  it('treats autoplay denial as a request for a user gesture, not a broken stream', () => {
    renderVideo();
    act(() => player().props.onError({ name: 'NotAllowedError' }));
    expect(mocks.store.getState().desiredPlaySpeed).toBe(0);
    expect(mocks.store.getState().isBufferingVideo).toBe(false);
    expect(screen.queryByRole('button', { name: 'Retry video' })).not.toBeInTheDocument();
  });
});
