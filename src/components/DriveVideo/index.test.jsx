import React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { firstFrame, publicRoute } from '../../../config/vitest/publicRoute';
import { ACTION_MEDIA_STATE, ACTION_PAUSE } from '../../actions/types';
import ConnectedDriveVideo, { DriveVideo } from './index';
import { reducer, play } from '../../timeline/playback';
import { loadHls } from './hls';
import { isFirefox, isIos } from '../../utils/browser';

vi.mock('./hls', () => ({ loadHls: vi.fn() }));
vi.mock('../../utils/browser', () => ({ isIos: vi.fn(() => true), isFirefox: vi.fn(() => false) }));

// These tests exercise browser event/promise mechanics with actual route fields.
// JSDOM cannot decode the route or establish device/PWA compatibility.
const setMedia = (media, fields) => Object.entries(fields).forEach(([name, value]) => {
  Object.defineProperty(media, name, { configurable: true, writable: true, value });
});

function mountPlayer(extra = {}) {
  const dispatch = vi.fn();
  let props = {
    currentRoute: publicRoute, desiredPlaySpeed: 1, playRequest: 0,
    seekRequest: { offset: null, id: 0 }, offset: null, loop: null,
    isMuted: true, isBufferingVideo: true, dispatch, ...extra,
  };
  let player;
  const view = render(<DriveVideo {...props} ref={(value) => { player = value; }} />);
  const media = view.container.querySelector('video');
  setMedia(media, { readyState: 2, duration: publicRoute.duration / 1000, paused: false, ended: false, seeking: false });
  const update = (next) => {
    props = { ...props, ...next };
    view.rerender(<DriveVideo {...props} ref={(value) => { player = value; }} />);
  };
  return { ...view, media, dispatch, update, get player() { return player; } };
}

beforeEach(() => {
  isIos.mockReturnValue(true);
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('plays without waiting for readyState 4; only native events publish position/status', () => {
  const view = mountPlayer();
  expect(view.media.play).toHaveBeenCalledTimes(1);
  setMedia(view.media, { currentTime: 60 });
  fireEvent.timeUpdate(view.media);
  expect(view.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
    type: ACTION_MEDIA_STATE, media: { offset: 60000, isPlaying: true, isBufferingVideo: false },
  }));
  fireEvent.waiting(view.media);
  expect(view.dispatch.mock.lastCall[0].media.isBufferingVideo).toBe(true);
  fireEvent.playing(view.media);
  expect(view.dispatch.mock.lastCall[0].media.isBufferingVideo).toBe(false);
  expect(view.media.playbackRate).toBe(1);
});

it('keeps the latest seek while data is unavailable and does not repeat it on canplay', () => {
  const view = mountPlayer();
  setMedia(view.media, { readyState: 1 });
  view.update({ seekRequest: { offset: 60000, id: 1, route: publicRoute.fullname } });
  view.update({ seekRequest: { offset: 120000, id: 2, route: publicRoute.fullname } });
  fireEvent.loadedMetadata(view.media);
  expect(view.media.currentTime).toBe(0);
  setMedia(view.media, { readyState: 2 });
  fireEvent.loadedData(view.media);
  expect(view.media.currentTime).toBe(120);
  setMedia(view.media, { currentTime: 121 });
  fireEvent.canPlay(view.media);
  expect(view.media.currentTime).toBe(121);
});

it('handles a current play rejection and ignores one invalidated by a seek or pause', async () => {
  let reject;
  HTMLMediaElement.prototype.play.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  const view = mountPlayer();
  const oldReject = reject;
  view.update({ seekRequest: { offset: 60000, id: 1, route: publicRoute.fullname } });
  view.dispatch.mockClear();
  await act(async () => oldReject(new DOMException('Interrupted', 'AbortError')));
  expect(view.dispatch).not.toHaveBeenCalled();
  view.update({ playRequest: 1 });
  await act(async () => reject(new DOMException('Blocked', 'NotAllowedError')));
  expect(view.dispatch).toHaveBeenCalledWith({ type: ACTION_PAUSE });
  expect(view.dispatch.mock.lastCall[0].media).toEqual({ isPlaying: false, isBufferingVideo: false });
  view.update({ playRequest: 2 });
  const pausedReject = reject;
  view.update({ playRequest: 3, desiredPlaySpeed: 0 });
  view.dispatch.mockClear();
  await act(async () => pausedReject(new DOMException('Interrupted', 'AbortError')));
  expect(view.dispatch).not.toHaveBeenCalled();
});

it('preserves the selected loop and stops cleanly when no loop is selected', () => {
  const view = mountPlayer({ loop: { startTime: 60000, duration: 60000 } });
  fireEvent.loadedData(view.media);
  setMedia(view.media, { currentTime: 120 });
  fireEvent.timeUpdate(view.media);
  expect(view.media.currentTime).toBe(60);
  view.update({ loop: null });
  setMedia(view.media, { currentTime: publicRoute.duration / 1000, ended: true, paused: true });
  fireEvent.ended(view.media);
  expect(view.dispatch).toHaveBeenCalledWith({ type: ACTION_PAUSE });
  expect(view.dispatch.mock.lastCall[0].media.isPlaying).toBe(false);
});

it('offers retry for terminal errors, rejects stale callbacks, and releases native media', () => {
  const view = mountPlayer();
  const key = view.player.sourceKey();
  act(() => view.player.onError({ response: { code: 404 } }, null, key));
  expect(view.getByText('This video segment has not uploaded yet or has been deleted.')).toBeInTheDocument();
  fireEvent.click(view.getByText('Retry'));
  expect(view.queryByText('This video segment has not uploaded yet or has been deleted.')).not.toBeInTheDocument();
  view.dispatch.mockClear();
  act(() => view.player.onError(new Error('Old request'), null, key));
  expect(view.dispatch).not.toHaveBeenCalled();
  const oldMedia = view.media;
  view.unmount();
  fireEvent.timeUpdate(oldMedia);
  expect(view.dispatch).not.toHaveBeenCalled();
  expect(oldMedia.load).toHaveBeenCalled();
});

it('handles CDN failure and does not create HLS after the player unmounts', async () => {
  isIos.mockReturnValue(false);
  HTMLMediaElement.prototype.canPlayType.mockReturnValue('');
  let reject;
  loadHls.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  const view = mountPlayer();
  await act(async () => reject(new Error('CDN unavailable')));
  expect(view.getByText('Unable to load video. Check your connection and retry.')).toBeInTheDocument();
  let resolve;
  loadHls.mockImplementation(() => new Promise((done) => { resolve = done; }));
  fireEvent.click(view.getByText('Retry'));
  view.unmount();
  const Hls = vi.fn();
  await act(async () => resolve(Hls));
  expect(Hls).not.toHaveBeenCalled();
});

it('retains terminal Retry across its own pause feedback and a normal Play command', () => {
  const store = createStore(reducer, {
    currentRoute: publicRoute, desiredPlaySpeed: 1, playRequest: 0,
    seekRequest: { offset: null, id: 0 }, offset: null, loop: null,
    isPlaying: false, isBufferingVideo: true,
  });
  const view = render(<Provider store={store}><ConnectedDriveVideo isMuted /></Provider>);
  fireEvent.error(view.container.querySelector('video'));
  expect(store.getState().desiredPlaySpeed).toBe(0);
  expect(view.getByText('Retry')).toBeInTheDocument();
  act(() => store.dispatch(play()));
  expect(view.getByText('Retry')).toBeInTheDocument();
});

it('prioritizes a new seek over the position saved for Retry', () => {
  const view = mountPlayer({ offset: 60000 });
  fireEvent.loadedData(view.media);
  act(() => view.player.onError(new Error('Network interruption'), null, view.player.sourceKey()));
  fireEvent.click(view.getByText('Retry'));
  const media = view.container.querySelector('video');
  setMedia(media, { readyState: 1, duration: publicRoute.duration / 1000 });
  view.update({ seekRequest: { offset: 120000, id: 1, route: publicRoute.fullname } });
  setMedia(media, { readyState: 2 });
  fireEvent.loadedData(media);
  expect(media.currentTime).toBe(120);
  fireEvent.seeked(media);
  expect(view.dispatch.mock.lastCall[0].media.seekRequest.offset).toBeNull();
});

it('calibrates a late actual camera timestamp and stops a range before available video', () => {
  const view = mountPlayer({ offset: 60000 });
  fireEvent.loadedData(view.media);
  setMedia(view.media, { currentTime: 60 });
  const cameraRoute = { ...publicRoute, videoStartOffset: firstFrame.route_offset_millis };
  view.update({ currentRoute: cameraRoute });
  expect(view.media.currentTime).toBe((60000 - firstFrame.route_offset_millis) / 1000);
  expect(view.dispatch.mock.lastCall[0].media.offset).toBe(60000);
  view.update({ loop: { startTime: 0, duration: firstFrame.offset_millis } });
  setMedia(view.media, { currentTime: 0 });
  fireEvent.timeUpdate(view.media);
  expect(view.dispatch).toHaveBeenCalledWith({ type: ACTION_PAUSE });
  expect(view.getByText('No video is available in the selected range.')).toBeInTheDocument();
  expect(view.queryByText('Retry')).not.toBeInTheDocument();
});

it('queues late camera calibration through buffering and preserves a newer seek', () => {
  const view = mountPlayer({ offset: 60000 });
  fireEvent.loadedData(view.media);
  setMedia(view.media, { currentTime: 60, readyState: 1 });
  const cameraRoute = { ...publicRoute, videoStartOffset: firstFrame.route_offset_millis };
  view.update({ currentRoute: cameraRoute });
  expect(view.media.currentTime).toBe(60);
  setMedia(view.media, { readyState: 2 });
  fireEvent.canPlay(view.media);
  expect(view.media.currentTime).toBe((60000 - firstFrame.route_offset_millis) / 1000);
  setMedia(view.media, { readyState: 1 });
  view.update({ seekRequest: { offset: 120000, id: 1, route: publicRoute.fullname } });
  setMedia(view.media, { readyState: 2 });
  fireEvent.loadedData(view.media);
  expect(view.media.currentTime).toBe((120000 - firstFrame.route_offset_millis) / 1000);
});

it('reapplies the existing Firefox audible rate cap without issuing another play', () => {
  isFirefox.mockReturnValue(true);
  const view = mountPlayer({ desiredPlaySpeed: 16 });
  expect(view.media.playbackRate).toBe(16);
  view.update({ isMuted: false });
  expect(view.media.playbackRate).toBe(8);
  expect(view.media.play).toHaveBeenCalledTimes(1);
  isFirefox.mockReturnValue(false);
});

it('ignores a pending play rejection invalidated by actual camera calibration', async () => {
  let reject;
  HTMLMediaElement.prototype.play.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  const view = mountPlayer({ offset: 60000 });
  fireEvent.loadedData(view.media);
  view.update({ playRequest: 1 });
  const oldReject = reject;
  view.update({ currentRoute: { ...publicRoute, videoStartOffset: firstFrame.route_offset_millis } });
  view.dispatch.mockClear();
  await act(async () => oldReject(new DOMException('Interrupted by seek', 'AbortError')));
  expect(view.dispatch).not.toHaveBeenCalled();
});
