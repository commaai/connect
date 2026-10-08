import { vi } from 'vitest';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import DriveVideo from '.';
import { reducer, pause, play, seek, selectLoop } from '../../timeline/playback';

const players = vi.hoisted(() => []);
vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (route) => `https://video.test/${route}.m3u8` } },
}));
vi.mock('react-player/file', async () => {
  const { forwardRef, useImperativeHandle, useRef } = await import('react');
  return {
    default: forwardRef((props, ref) => {
      const instance = useRef();
      if (!instance.current) {
        const media = Object.assign(new EventTarget(), {
          readyState: 4, currentTime: 0, duration: 10, seeking: false, ended: false, paused: true,
          play: vi.fn(() => { media.paused = false; return Promise.resolve(); }),
          pause: vi.fn(() => { media.paused = true; }),
          audioTracks: Object.assign(new EventTarget(), { length: 0 }),
        });
        const hls = { on: vi.fn(), off: vi.fn(), audioTracks: [] };
        const player = {
          getInternalPlayer: (key) => key === 'hls' ? hls : media,
          getCurrentTime: () => media.currentTime,
          getDuration: () => media.duration,
          seekTo: vi.fn((seconds) => { media.currentTime = seconds; media.seeking = true; }),
        };
        instance.current = { media, hls, player };
        players.push(instance.current);
      }
      instance.current.props = props;
      useImperativeHandle(ref, () => instance.current.player);
      return React.createElement('div', {
        'data-testid': 'player', 'data-playing': String(props.playing), 'data-rate': props.playbackRate,
      });
    }),
  };
});

function setup(overrides = {}) {
  const initial = {
    currentRoute: { fullname: 'device/route', duration: 10000, videoStartOffset: 1000 },
    offset: 1000, seekVersion: 0, desiredPlaySpeed: 1, isBufferingVideo: true, loop: null,
    ...overrides,
  };
  const store = createStore((state = initial, action) => {
    if (action.type === 'SET_ROUTE') return { ...state, currentRoute: action.route };
    return reducer(state, action);
  });
  const audio = vi.fn();
  const view = render(React.createElement(Provider, { store },
    React.createElement(DriveVideo, { isMuted: true, onAudioStatusChange: audio })));
  const ready = () => act(() => players.at(-1).props.onReady());
  const seeked = () => act(() => {
    const latest = players.at(-1);
    latest.media.seeking = false;
    latest.props.onSeek(latest.media.currentTime);
  });
  return { store, audio, ready, seeked, ...view };
}

beforeEach(() => players.splice(0));

describe('drive media authority', () => {
  it('publishes actual media time without periodic correction or rate nudges', () => {
    const { store, ready } = setup();
    ready();
    const latest = players.at(-1);
    latest.media.currentTime = 2.35;
    act(() => latest.props.onProgress({ playedSeconds: 2.35 }));
    expect(store.getState().offset).toBe(3350);
    act(() => store.dispatch(play(2)));
    expect(screen.getByTestId('player')).toHaveAttribute('data-rate', '2');
    expect(latest.player.seekTo).not.toHaveBeenCalled();
    act(() => store.dispatch(pause()));
    expect(screen.getByTestId('player')).toHaveAttribute('data-playing', 'false');
    expect(screen.getByTestId('player')).toHaveAttribute('data-rate', '1');
  });

  it('waits for metadata, applies the latest seek once, and ignores progress in flight', () => {
    const { store, ready, seeked } = setup({ offset: 4000 });
    const latest = players.at(-1);
    latest.media.readyState = 0;
    ready();
    expect(latest.player.seekTo).not.toHaveBeenCalled();
    act(() => store.dispatch(seek(6000)));
    act(() => latest.props.onProgress({ playedSeconds: 0 }));
    expect(store.getState().offset).toBe(6000);
    latest.media.readyState = 4;
    act(() => latest.media.dispatchEvent(new Event('loadedmetadata')));
    expect(latest.player.seekTo).toHaveBeenCalledExactlyOnceWith(5, 'seconds');
    act(() => latest.props.onProgress({ playedSeconds: 5 }));
    expect(store.getState().offset).toBe(6000);
    seeked();
    expect(store.getState().isBufferingVideo).toBe(false);
    act(() => latest.props.onProgress({ playedSeconds: 5 }));
    expect(latest.player.seekTo).toHaveBeenCalledTimes(1);
  });

  it('keeps a paused seek usable and loading ends when that seek completes', () => {
    const { store, ready, seeked } = setup({ desiredPlaySpeed: 0, offset: 4000 });
    ready();
    expect(players.at(-1).player.seekTo).toHaveBeenCalledExactlyOnceWith(3, 'seconds');
    seeked();
    expect(store.getState()).toMatchObject({ offset: 4000, desiredPlaySpeed: 0, isBufferingVideo: false });
  });

  it('does not acknowledge an older seek while a newer seek is in flight', () => {
    const { store, ready, seeked } = setup();
    ready();
    const latest = players.at(-1);
    act(() => store.dispatch(seek(3000)));
    act(() => store.dispatch(seek(7000)));
    act(() => {
      latest.props.onSeek(2);
      latest.props.onProgress({ playedSeconds: 2 });
    });
    expect(store.getState().offset).toBe(7000);
    expect(latest.player.seekTo.mock.calls).toEqual([[2, 'seconds'], [6, 'seconds']]);
    seeked();
    expect(store.getState()).toMatchObject({ offset: 7000, isBufferingVideo: false });
  });

  it('wraps a zero-start loop at the actual media boundary', () => {
    const { store, ready, seeked } = setup({
      currentRoute: { fullname: 'device/route', duration: 10000, videoStartOffset: 0 },
      offset: 0, loop: { startTime: 0, duration: 2000 },
    });
    ready();
    const latest = players.at(-1);
    latest.media.currentTime = 2.02;
    act(() => latest.props.onProgress({ playedSeconds: 2.02 }));
    expect(latest.player.seekTo).toHaveBeenCalledExactlyOnceWith(0, 'seconds');
    seeked();
    expect(store.getState().offset).toBe(0);
  });

  it('restarts an ended loop without corrective seeks during normal playback', async () => {
    const { ready, seeked } = setup({ offset: 1000, loop: { startTime: 1000, duration: 9000 } });
    ready();
    const latest = players.at(-1);
    latest.media.currentTime = 9;
    latest.media.ended = true;
    act(() => latest.props.onEnded());
    expect(latest.player.seekTo).toHaveBeenCalledExactlyOnceWith(0, 'seconds');
    await act(async () => seeked());
    expect(latest.media.play).toHaveBeenCalledTimes(1);
  });

  it('does not start a selected loop after the actual video ends', () => {
    const { store, ready, seeked } = setup({ offset: 9000, loop: { startTime: 9000, duration: 1000 } });
    const latest = players.at(-1);
    latest.media.duration = 7;
    ready();
    seeked();
    latest.media.ended = true;
    act(() => latest.props.onEnded());
    expect(store.getState()).toMatchObject({ offset: 9000, desiredPlaySpeed: 0 });
    expect(latest.media.play).not.toHaveBeenCalled();
    expect(latest.player.seekTo).not.toHaveBeenCalled();
    expect(screen.getByText('No video is available in this selected range.')).toBeInTheDocument();
  });

  it('does not play a loop wholly before the first video frame', () => {
    const { store, ready } = setup({
      currentRoute: { fullname: 'device/route', duration: 10000, videoStartOffset: 3000 },
      offset: 0, loop: { startTime: 0, duration: 1000 },
    });
    ready();
    const latest = players.at(-1);
    expect(store.getState()).toMatchObject({ offset: 0, desiredPlaySpeed: 0, isBufferingVideo: false });
    expect(screen.getByTestId('player')).toHaveAttribute('data-playing', 'false');
    expect(screen.getByText('No video is available in this selected range.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    latest.media.currentTime = 2;
    act(() => latest.props.onProgress({ playedSeconds: 2 }));
    expect(store.getState().offset).toBe(0);
    expect(latest.player.seekTo).not.toHaveBeenCalled();
  });

  it('stops when late metadata makes the selection empty and recovers with a playable range', () => {
    const { store, ready } = setup({
      currentRoute: { fullname: 'device/route', duration: 10000, videoStartOffset: 0 },
      offset: 0, loop: { startTime: 0, duration: 1000 },
    });
    ready();
    act(() => store.dispatch({
      type: 'SET_ROUTE', route: { fullname: 'device/route', duration: 10000, videoStartOffset: 3000 },
    }));
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(screen.getByText('No video is available in this selected range.')).toBeInTheDocument();
    act(() => {
      store.dispatch(selectLoop(3000, 5000));
      store.dispatch(play(1));
    });
    expect(screen.queryByText('No video is available in this selected range.')).not.toBeInTheDocument();
    expect(screen.getByTestId('player')).toHaveAttribute('data-playing', 'true');
  });

  it('disposes audio listeners and ignores callbacks from the previous route', () => {
    const { store, ready, audio } = setup();
    ready();
    const previous = players.at(-1);
    const staleProgress = previous.props.onProgress;
    act(() => store.dispatch({
      type: 'SET_ROUTE', route: { fullname: 'device/next', duration: 10000, videoStartOffset: 0 },
    }));
    expect(players).toHaveLength(2);
    expect(previous.hls.off).toHaveBeenCalledWith('hlsBufferCodecs', expect.any(Function));
    audio.mockClear();
    act(() => {
      previous.media.audioTracks.length = 1;
      previous.media.audioTracks.dispatchEvent(new Event('addtrack'));
      staleProgress({ playedSeconds: 9 });
    });
    expect(audio).not.toHaveBeenCalled();
    expect(store.getState().offset).toBe(1000);
  });

  it('treats recoverable HLS errors as recoverable and retries fatal load failures', () => {
    const { ready } = setup();
    ready();
    const previous = players.at(-1);
    act(() => previous.props.onError('hlsError', { fatal: false }));
    expect(screen.queryByText('Unable to load video.')).not.toBeInTheDocument();
    act(() => previous.props.onError('hlsError', { fatal: true, response: { code: 404 } }));
    expect(screen.getByText('This video segment has not uploaded yet or has been deleted.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(players).toHaveLength(2);
    act(() => previous.props.onError(new Error('old player error')));
    expect(screen.queryByText('Unable to load video.')).not.toBeInTheDocument();
  });

  it('handles blocked autoplay with a real gesture and preserves the requested speed', async () => {
    const { store, ready } = setup({ desiredPlaySpeed: 2 });
    ready();
    const latest = players.at(-1);
    act(() => latest.props.onError(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play video' })));
    expect(latest.media.play).toHaveBeenCalledTimes(1);
    expect(store.getState().desiredPlaySpeed).toBe(2);
    expect(screen.queryByText('Tap to play video.')).not.toBeInTheDocument();
  });

  it('lets the normal play control retry blocked autoplay', () => {
    const { store, ready } = setup();
    ready();
    act(() => players.at(-1).props.onError(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
    act(() => store.dispatch(play(1)));
    expect(screen.getByTestId('player')).toHaveAttribute('data-playing', 'true');
    expect(screen.queryByText('Tap to play video.')).not.toBeInTheDocument();
  });

  it('mirrors native pause and play at the selected speed and keeps looping active', () => {
    const { store, ready } = setup({ desiredPlaySpeed: 2, loop: { startTime: 1000, duration: 2000 } });
    ready();
    const latest = players.at(-1);
    latest.media.paused = true;
    act(() => latest.props.onPause());
    expect(store.getState().desiredPlaySpeed).toBe(0);
    latest.media.paused = false;
    act(() => latest.props.onPlay());
    expect(store.getState().desiredPlaySpeed).toBe(2);
    expect(screen.getByTestId('player')).toHaveAttribute('data-playing', 'true');
    expect(screen.getByTestId('player')).toHaveAttribute('data-rate', '2');
    latest.media.currentTime = 2;
    act(() => latest.props.onProgress({ playedSeconds: 2 }));
    expect(latest.player.seekTo).toHaveBeenCalledExactlyOnceWith(0, 'seconds');
  });

  it('ignores stale native play after an explicit pause and stale pause after native resume', () => {
    const { store, ready } = setup({ desiredPlaySpeed: 2 });
    ready();
    const latest = players.at(-1);
    latest.media.paused = false;
    act(() => store.dispatch(pause()));
    expect(latest.media.paused).toBe(true);
    act(() => latest.props.onPlay());
    expect(store.getState().desiredPlaySpeed).toBe(0);
    latest.media.paused = false;
    act(() => latest.props.onPlay());
    act(() => latest.props.onPause());
    expect(store.getState().desiredPlaySpeed).toBe(2);
  });

  it('preserves blocked autoplay speed when native play fires before its retry promise resolves', async () => {
    const { store, ready } = setup({ desiredPlaySpeed: 2 });
    ready();
    const latest = players.at(-1);
    act(() => latest.props.onError(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
    let resolvePlay;
    latest.media.play.mockImplementation(() => new Promise((resolve) => {
      latest.media.paused = false;
      resolvePlay = resolve;
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    act(() => latest.props.onPlay());
    expect(store.getState().desiredPlaySpeed).toBe(2);
    expect(screen.queryByText('Tap to play video.')).not.toBeInTheDocument();
    await act(async () => resolvePlay());
    expect(store.getState().desiredPlaySpeed).toBe(2);
  });

  it('does not undo a later pause when an ended-loop play promise resolves', async () => {
    const { store, ready, seeked } = setup({ loop: { startTime: 1000, duration: 9000 } });
    ready();
    const latest = players.at(-1);
    let resolvePlay;
    latest.media.play.mockImplementation(() => new Promise((resolve) => { resolvePlay = resolve; }));
    latest.media.currentTime = 9;
    latest.media.ended = true;
    act(() => latest.props.onEnded());
    seeked();
    act(() => store.dispatch(pause()));
    await act(async () => resolvePlay());
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('does not restart an ended loop when paused before the loop seek completes', () => {
    const { store, ready, seeked } = setup({ loop: { startTime: 1000, duration: 9000 } });
    ready();
    const latest = players.at(-1);
    latest.media.currentTime = 9;
    latest.media.ended = true;
    act(() => latest.props.onEnded());
    act(() => store.dispatch(pause()));
    seeked();
    expect(latest.media.play).not.toHaveBeenCalled();
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('does not overwrite a new speed when an earlier autoplay retry resolves', async () => {
    const { store, ready } = setup({ desiredPlaySpeed: 2 });
    ready();
    const latest = players.at(-1);
    act(() => latest.props.onError(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
    let resolvePlay;
    latest.media.play.mockImplementation(() => new Promise((resolve) => { resolvePlay = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    act(() => store.dispatch(play(4)));
    await act(async () => resolvePlay());
    expect(store.getState().desiredPlaySpeed).toBe(4);
  });

  it('does not reuse an old autoplay speed when a later loop ends', async () => {
    const { store, ready, seeked } = setup({ desiredPlaySpeed: 2, loop: { startTime: 1000, duration: 9000 } });
    ready();
    const latest = players.at(-1);
    act(() => latest.props.onError(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play video' })));
    act(() => store.dispatch(play(4)));
    latest.media.currentTime = 9;
    latest.media.ended = true;
    act(() => latest.props.onEnded());
    await act(async () => seeked());
    expect(store.getState().desiredPlaySpeed).toBe(4);
  });
});
