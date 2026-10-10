import React from 'react';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import DriveVideo from '.';
import { currentOffset } from '../../timeline';
import { pause, seek } from '../../timeline/playback';
import rootReducer from '../../reducers';
import * as Types from '../../actions/types';

const mocks = vi.hoisted(() => ({ props: null, media: null, seekTo: vi.fn() }));
vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: (route) => `https://example.com/${route}.m3u8` } } }));
vi.mock('react-player/file', () => ({
  default: React.forwardRef((props, ref) => {
    const player = {
      getInternalPlayer: (type) => type === 'hls' ? null : mocks.media,
      getCurrentTime: () => mocks.media.currentTime,
      getDuration: () => mocks.media.duration,
      seekTo: mocks.seekTo,
    };
    mocks.props = props;
    React.useImperativeHandle(ref, () => player);
    React.useEffect(() => { if (props.url) { mocks.media.currentTime = 0; props.onReady(player); } }, [props.url]);
    return <div data-testid="video-player" />;
  }),
}));

function finishSeek() {
  act(() => { mocks.media.seeking = false; mocks.props.onSeek(); });
}
function renderPlayer(overrides = {}) {
  const store = createStore(rootReducer, {
    currentRoute: { fullname: 'route', duration: 120000, videoStartOffset: 0 },
    desiredPlaySpeed: 1, isBufferingVideo: true, offset: 0, startTime: Date.now(),
    zoom: { start: 0, end: 120000 }, loop: { startTime: 0, duration: 120000 },
    ...overrides,
  });
  const view = render(<Provider store={store}><DriveVideo isMuted /></Provider>);
  if (mocks.media.seeking) finishSeek();
  mocks.seekTo.mockClear();
  return { ...view, store };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  mocks.media = {
    currentTime: 0, duration: 120, readyState: 4, paused: true, seeking: false, ended: false, playbackRate: 1,
    buffered: { length: 1, start: () => 0, end: () => 120 },
    play: vi.fn(async () => { mocks.media.paused = false; }),
    pause: vi.fn(() => { mocks.media.paused = true; }),
  };
  mocks.seekTo.mockReset().mockImplementation((seconds) => { mocks.media.currentTime = seconds; mocks.media.seeking = true; });
});
afterEach(() => { vi.useRealTimers(); });

it('follows actual media time without periodically seeking or adjusting playback speed', () => {
  const { store } = renderPlayer();
  mocks.media.currentTime = 5;
  act(() => { vi.advanceTimersByTime(2000); });
  expect(currentOffset(store.getState())).toBe(5000);
  expect(mocks.seekTo).not.toHaveBeenCalled();
  expect(mocks.media.playbackRate).toBe(1);
});
it('coalesces rapid seeks while retaining the latest requested position', () => {
  const { store } = renderPlayer();
  act(() => { store.dispatch(pause()); store.dispatch(seek(10000)); });
  act(() => { store.dispatch(seek(20000)); });
  expect(currentOffset(store.getState())).toBe(20000);
  expect(mocks.seekTo).toHaveBeenCalledTimes(1);
  finishSeek();
  expect(mocks.seekTo).toHaveBeenCalledTimes(2);
  finishSeek();
  expect(mocks.media.currentTime).toBe(20);
  expect(mocks.media.paused).toBe(true);
});
it('clears buffering after a paused native seek with a decoded frame', () => {
  const { store } = renderPlayer({ desiredPlaySpeed: 0 });
  act(() => { store.dispatch(seek(15000)); mocks.props.onBuffer(); });
  mocks.media.readyState = 2;
  mocks.media.buffered.length = 0;
  finishSeek();
  expect(store.getState().isBufferingVideo).toBe(false);
  expect(mocks.media.paused).toBe(true);
  expect(mocks.props.playbackRate).toBe(1);
});
it('aligns late first-frame metadata without seeking the video', () => {
  const { store } = renderPlayer();
  mocks.media.currentTime = 6;
  act(() => { store.dispatch({ type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: 'route',
    events: [{ type: 'event', data: { event_type: 'first_road_camera_frame' }, route_offset_millis: 5000 }],
  }); });
  expect(currentOffset(store.getState())).toBe(11000);
  expect(mocks.seekTo).not.toHaveBeenCalled();
});
it('loads a new route at its selection start instead of reusing the previous seek', () => {
  const { store } = renderPlayer({ routes: [{ fullname: 'other', log_id: 'second', duration: 120000 }] });
  act(() => { store.dispatch(seek(50000)); });
  finishSeek();
  act(() => { store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 'second', start: 10000, end: 20000 }); });
  if (mocks.media.seeking) finishSeek();
  expect(mocks.media.currentTime).toBe(10);
});
it('loops a selection and pauses at the end of a whole drive', () => {
  const selected = renderPlayer({ zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 } });
  act(() => { mocks.media.currentTime = 20; mocks.props.onProgress(); });
  finishSeek();
  expect(mocks.media.currentTime).toBe(10);
  selected.unmount();
  const whole = renderPlayer();
  act(() => { mocks.media.currentTime = 120; mocks.media.ended = true; mocks.props.onEnded(); });
  expect(whole.store.getState().desiredPlaySpeed).toBe(0);
  expect(currentOffset(whole.store.getState())).toBe(120000);
});
