import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryHistory } from 'history';
import { createAppStore } from '../../store';
import { createInitialState } from '../../initialState';
import DriveVideo from './index';
import { seek, play } from '../../timeline/playback';

const source = vi.hoisted(() => ({ callbacks: null, ready: true }));
vi.mock('./transport', () => ({ attachSource: (video, callbacks) => {
  source.callbacks = callbacks;
  Object.defineProperty(video, 'readyState', { configurable: true, value: source.ready ? 4 : 1 });
  Object.defineProperty(video, 'buffered', { configurable: true, value: { length: source.ready ? 1 : 0, start: () => 0, end: () => 60 } });
  Object.defineProperty(video, 'duration', { configurable: true, value: 60 });
  callbacks.onStatus({ loading: false, error: null, blocked: false });
  return { destroy: vi.fn(), retry: vi.fn(), reportError: vi.fn() };
} }));
vi.mock('./VideoStatus', () => ({ default: () => null }));
vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: () => 'https://video.example/playlist.m3u8' } } }));

const ROUTE = { fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00', duration: 60000,
  segment_numbers: [0], segment_start_times: [0], segment_end_times: [60000] };
function setup() {
  const history = createMemoryHistory({ initialEntries: ['/aaaaaaaaaaaaaaaa/2026-08-06--12-00-00/10/20'] });
  const initial = { ...createInitialState(history.location), currentRoute: ROUTE,
    desiredPlaySpeed: 0, loop: { startTime: 10000, duration: 10000 }, zoom: { start: 10000, end: 20000 } };
  const store = createAppStore(history, initial);
  const view = render(<Provider store={store}><DriveVideo isMuted /></Provider>);
  act(() => source.callbacks.onTimeline([{ number: 0, start: 0, duration: 60 }]));
  return { store, ...view };
}
beforeEach(() => {
  source.ready = true;
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

test('real middleware seeks cold range start, later exact seek and speed on the same element', () => {
  const { store } = setup();
  const video = screen.getByLabelText('Drive video');
  expect(video.currentTime).toBe(10);
  expect(store.getState().seekOffset).toBe(10000);
  act(() => store.dispatch(seek(10001)));
  expect(video.currentTime).toBe(10.001);
  act(() => store.dispatch(play(0.5)));
  expect(video.playbackRate).toBe(0.5);
  expect(screen.getByLabelText('Drive video')).toBe(video);
});

test('route source is retired on unmount even if a stale pause callback fires', () => {
  const { store, unmount } = setup();
  const video = screen.getByLabelText('Drive video');
  unmount();
  act(() => store.dispatch(play(2)));
  video.dispatchEvent(new Event('pause'));
  expect(store.getState().desiredPlaySpeed).toBe(2);
});


test('late playlist mapping reissues the explicit target rather than leaving a linear seek', () => {
  const { store } = setup();
  const video = screen.getByLabelText('Drive video');
  const before = store.getState().seekRevision;
  act(() => source.callbacks.onTimeline([{ number: 0, start: 0, duration: 60 }]));
  expect(store.getState().seekRevision).toBeGreaterThan(before);
  expect(video.currentTime).toBe(10);
});

test('late mapping retains the explicit target while native seek is still pending', () => {
  const { store } = setup();
  const video = screen.getByLabelText('Drive video');
  let actual = 10;
  Object.defineProperty(video, 'currentTime', { configurable: true, get: () => actual, set: () => {} });
  Object.defineProperty(video, 'seeking', { configurable: true, value: true });
  act(() => store.dispatch(seek(15000)));
  expect(store.getState().seekOffset).toBe(15000);
  act(() => source.callbacks.onTimeline([{ number: 0, start: 0, duration: 60 }]));
  expect(store.getState().seekOffset).toBe(15000);
});


test('first nonzero native seek waits for buffered data then applies the unchanged command', () => {
  const { store } = setup();
  const video = screen.getByLabelText('Drive video');
  source.ready = false;
  video.currentTime = 0;
  // Reattach the same route with fresh credentials to start a new source.
  Object.defineProperty(video, 'readyState', { configurable: true, value: 1 });
  Object.defineProperty(video, 'buffered', { configurable: true, value: { length: 0 } });
  act(() => store.dispatch({ type: 'ACTION_UPDATE_ROUTE', fullname: ROUTE.fullname, route: { share_sig: 'new' } }));
  act(() => source.callbacks.onTimeline([{ number: 0, start: 0, duration: 60 }]));
  expect(store.getState().seekOffset).toBe(10000);
  expect(video.currentTime).toBe(0);
  Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
  Object.defineProperty(video, 'buffered', { configurable: true, value: { length: 1, start: () => 0, end: () => 60 } });
  act(() => video.dispatchEvent(new Event('canplay')));
  expect(video.currentTime).toBe(10);
});
