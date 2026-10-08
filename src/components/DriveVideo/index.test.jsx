import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

import DriveVideo from '.';
import { currentOffset } from '../../timeline';
import { pause, seek } from '../../timeline/playback';
import rootReducer from '../../reducers';
import * as Types from '../../actions/types';

const mocks = vi.hoisted(() => ({ props: null, media: null, hls: null, seekTo: vi.fn() }));
vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (route) => `https://example.com/${route}.m3u8` } },
}));
vi.mock('react-player/file', () => ({
  default: React.forwardRef((props, ref) => {
    React.useEffect(() => { mocks.props = props; });
    const player = {
      getInternalPlayer: (type) => type === 'hls' ? mocks.hls : mocks.media,
      seekTo: mocks.seekTo,
    };
    React.useImperativeHandle(ref, () => player);
    React.useEffect(() => { props.onReady(player); }, []);
    React.useEffect(() => {
      mocks.media.paused = !props.playing;
      if (props.playing) { props.onPlay(); props.onBufferEnd(); }
      else props.onPause();
    }, [props.playing]);
    return <div data-testid="video-player" />;
  }),
}));

function finishSeek() {
  act(() => {
    mocks.media.seeking = false;
    mocks.props.onSeek();
  });
}

function renderPlayer(overrides = {}) {
  const store = createStore(rootReducer, {
    currentRoute: { fullname: 'route', duration: 120000, videoStartOffset: 0 },
    desiredPlaySpeed: 1, isBufferingVideo: true, offset: 0, startTime: Date.now(),
    videoPlaySpeed: null, seekRequest: null,
    zoom: { start: 0, end: 120000 }, loop: { startTime: 0, duration: 120000 },
    routes: [{ fullname: 'route', log_id: 'first', duration: 120000 }, { fullname: 'other', log_id: 'second', duration: 120000 }],
    ...overrides,
  });
  const audioStatus = vi.fn();
  const view = render(<Provider store={store}><DriveVideo isMuted onAudioStatusChange={audioStatus} /></Provider>);
  if (mocks.media.seeking) finishSeek();
  mocks.seekTo.mockClear();
  return { ...view, store, audioStatus };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1000);
  mocks.hls = null;
  mocks.media = {
    currentTime: 0, duration: 120, readyState: 4, paused: true, seeking: false,
    ended: false, playbackRate: 1, audioTracks: [],
    play: vi.fn(async () => { mocks.media.paused = false; }),
  };
  mocks.seekTo.mockReset().mockImplementation((seconds) => {
    mocks.media.currentTime = seconds;
    mocks.media.seeking = true;
    mocks.props.config.file.attributes.onSeeking();
  });
});
afterEach(() => { vi.useRealTimers(); });

it('publishes media time without seeking or changing the media rate', () => {
  const { store } = renderPlayer();
  act(() => { mocks.media.currentTime = 5; mocks.props.onProgress(); });
  expect(store.getState().offset).toBe(5000);
  vi.setSystemTime(1100);
  expect(currentOffset(store.getState())).toBe(5100);
  expect(mocks.seekTo).not.toHaveBeenCalled();
  expect(mocks.media.playbackRate).toBe(1);
});

it('freezes display time while waiting and resumes from the media position', () => {
  const { store } = renderPlayer();
  act(() => { mocks.media.currentTime = 5; mocks.props.onBuffer(); });
  vi.setSystemTime(3000);
  expect(currentOffset(store.getState())).toBe(5000);
  act(() => { mocks.media.currentTime = 6; mocks.props.onBufferEnd(); });
  expect(store.getState().offset).toBe(6000);
  expect(store.getState().isBufferingVideo).toBe(false);
});

it('applies repeated seeks immediately and keeps paused seeks paused', () => {
  const { store } = renderPlayer();
  act(() => { store.dispatch(pause()); });
  act(() => { store.dispatch(seek(10000)); });
  act(() => { store.dispatch(seek(20000)); });
  act(() => { store.dispatch(seek(20000)); });
  finishSeek();
  expect(mocks.media.currentTime).toBe(20);
  expect(mocks.media.paused).toBe(true);
  expect(store.getState().offset).toBe(20000);
  expect(store.getState().isBufferingVideo).toBe(false);
  expect(mocks.media.playbackRate).toBeGreaterThan(0);
  const seekCount = mocks.seekTo.mock.calls.length;
  act(() => { mocks.props.onProgress(); });
  expect(mocks.seekTo).toHaveBeenCalledTimes(seekCount);
});

it('handles browser pause and play controls', () => {
  const { store } = renderPlayer();
  act(() => {
    mocks.media.currentTime = 5;
    mocks.media.paused = true;
    mocks.props.onPause();
  });
  expect(store.getState().offset).toBe(5000);
  expect(store.getState().desiredPlaySpeed).toBe(0);
  act(() => { mocks.media.paused = false; mocks.props.onPlay(); });
  expect(store.getState().desiredPlaySpeed).toBe(1);
});

it('loops a selected range and stops at the end of a whole route', () => {
  const selected = renderPlayer({ zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 } });
  act(() => { mocks.media.currentTime = 20; mocks.props.onProgress(); });
  finishSeek();
  expect(mocks.media.currentTime).toBe(10);
  expect(selected.store.getState().desiredPlaySpeed).toBe(1);
  selected.unmount();

  const whole = renderPlayer();
  act(() => {
    mocks.media.currentTime = 120;
    mocks.media.ended = true;
    mocks.media.paused = true;
    mocks.props.onEnded();
  });
  expect(whole.store.getState().desiredPlaySpeed).toBe(0);
  vi.setSystemTime(5000);
  expect(currentOffset(whole.store.getState())).toBe(120000);
});

it('releases playback to the existing map-only clock on unmount', () => {
  const view = renderPlayer();
  act(() => { mocks.media.currentTime = 5; mocks.props.onProgress(); });
  view.unmount();
  vi.setSystemTime(2000);
  expect(view.store.getState().videoPlaySpeed).toBeNull();
  expect(currentOffset(view.store.getState())).toBe(6000);
});

it('converts route offsets to video time and detects native audio after loading', () => {
  const { store, audioStatus } = renderPlayer({ currentRoute: { fullname: 'route', duration: 120000, videoStartOffset: 5000 } });
  expect(store.getState().offset).toBe(5000);
  act(() => { mocks.media.audioTracks = [{}]; mocks.props.config.file.attributes.onCanPlay(); });
  expect(audioStatus).toHaveBeenLastCalledWith(true);
  act(() => { store.dispatch(seek(15000)); });
  finishSeek();
  expect(mocks.media.currentTime).toBe(10);
  expect(store.getState().offset).toBe(15000);
});

it('starts a new route fresh and ignores errors from the previous player', () => {
  const { store } = renderPlayer();
  act(() => { mocks.media.currentTime = 30; mocks.props.onProgress(); });
  const oldError = mocks.props.onError;
  act(() => { store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 'second', start: null, end: null }); });
  finishSeek();
  expect(mocks.media.currentTime).toBe(0);
  expect(store.getState().offset).toBe(0);
  act(() => { oldError('hlsError', { fatal: true, type: 'networkError', response: { code: 404 } }); });
  expect(screen.queryByText('This video segment has not uploaded yet or has been deleted.')).not.toBeInTheDocument();
});

it('aligns late route metadata without seeking the playing video', () => {
  const { store } = renderPlayer();
  act(() => { mocks.media.currentTime = 6; mocks.props.onProgress(); });
  act(() => { store.dispatch({
    type: Types.ACTION_UPDATE_ROUTE_EVENTS,
    fullname: 'route',
    events: [{ type: 'event', data: { event_type: 'first_road_camera_frame' }, route_offset_millis: 5000 }],
  }); });
  expect(store.getState().offset).toBe(11000);
  expect(mocks.media.currentTime).toBe(6);
  expect(mocks.seekTo).not.toHaveBeenCalled();
});

it('reports a selection that ends before the first video frame', () => {
  const { store } = renderPlayer({
    currentRoute: { fullname: 'route', duration: 120000, videoStartOffset: 30000 },
    zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 },
  });
  expect(screen.getByText('No video is available in this selection.')).toBeInTheDocument();
  expect(store.getState().desiredPlaySpeed).toBe(0);
  expect(mocks.seekTo).not.toHaveBeenCalled();
});

it('reports a selection that starts after the last video frame', () => {
  mocks.media.duration = 5;
  const { store } = renderPlayer({
    zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 },
  });
  expect(screen.getByText('No video is available in this selection.')).toBeInTheDocument();
  expect(store.getState().desiredPlaySpeed).toBe(0);
  expect(mocks.seekTo).not.toHaveBeenCalled();
});

it('resumes map-only playback at its current position when video mounts', () => {
  const { store } = renderPlayer({ offset: 45000, isBufferingVideo: false });
  expect(mocks.media.currentTime).toBe(45);
  expect(store.getState().offset).toBe(45000);
});

it('recovers one fatal HLS media error and exposes a repeat failure', () => {
  mocks.hls = { on: vi.fn(), off: vi.fn(), recoverMediaError: vi.fn() };
  const { store } = renderPlayer();
  act(() => { mocks.props.onError('hlsError', { fatal: true, type: 'mediaError' }, mocks.hls); });
  expect(mocks.hls.recoverMediaError).toHaveBeenCalledTimes(1);
  expect(store.getState().desiredPlaySpeed).toBe(1);
  act(() => { mocks.media.paused = true; mocks.props.onPause(); });
  expect(store.getState().desiredPlaySpeed).toBe(1);
  act(() => { mocks.props.config.file.attributes.onCanPlay(); });
  expect(mocks.media.play).toHaveBeenCalled();
  expect(mocks.media.paused).toBe(false);
  act(() => { mocks.props.onError('hlsError', { fatal: true, type: 'mediaError' }, mocks.hls); });
  expect(mocks.hls.recoverMediaError).toHaveBeenCalledTimes(1);
  expect(store.getState().desiredPlaySpeed).toBe(0);
  expect(screen.getByRole('button', { name: 'Retry video' })).toBeInTheDocument();
});

it('lets HLS handle nonfatal errors without freezing playback', () => {
  const { store } = renderPlayer();
  act(() => { mocks.props.onError('hlsError', { fatal: false, type: 'networkError' }); });
  expect(store.getState().isBufferingVideo).toBe(false);
  expect(store.getState().desiredPlaySpeed).toBe(1);
  expect(screen.queryByRole('button', { name: 'Retry video' })).not.toBeInTheDocument();
});

it('allows a user gesture after autoplay is denied', () => {
  const { store } = renderPlayer();
  act(() => { mocks.props.onError({ name: 'NotAllowedError' }); });
  expect(store.getState().desiredPlaySpeed).toBe(0);
  expect(screen.queryByRole('button', { name: 'Retry video' })).not.toBeInTheDocument();
  act(() => { mocks.media.paused = false; mocks.props.onPlay(); });
  expect(store.getState().desiredPlaySpeed).toBe(1);
});

it('reports a missing stream and lets the user retry', () => {
  const { store } = renderPlayer();
  act(() => { mocks.props.onError('hlsError', { fatal: true, type: 'networkError', response: { code: 404 } }); });
  expect(screen.getByText('This video segment has not uploaded yet or has been deleted.')).toBeInTheDocument();
  expect(store.getState().desiredPlaySpeed).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Retry video' }));
  expect(screen.queryByText('This video segment has not uploaded yet or has been deleted.')).not.toBeInTheDocument();
  expect(store.getState().desiredPlaySpeed).toBe(1);
});

it('waits for metadata when a video loads paused', () => {
  mocks.media.readyState = 0;
  const { store } = renderPlayer({ desiredPlaySpeed: 0, offset: 15000, zoom: { start: 15000, end: 20000 }, loop: { startTime: 15000, duration: 5000 } });
  expect(mocks.seekTo).not.toHaveBeenCalled();
  act(() => {
    mocks.media.readyState = 4;
    mocks.props.config.file.attributes.onLoadedMetadata();
  });
  finishSeek();
  expect(mocks.media.currentTime).toBe(15);
  expect(mocks.media.paused).toBe(true);
  expect(store.getState().isBufferingVideo).toBe(false);
});
