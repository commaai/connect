import React from 'react';
import { Provider } from 'react-redux';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import DriveVideo from '.';
import { createAppStore } from '../../store';
import * as Types from '../../actions/types';
import { play, resetPlayback, seek, selectLoop } from '../../timeline/playback';

const hls = vi.hoisted(() => ({ instances: [], load: null }));

vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: () => 'https://example.test/qcamera.m3u8' } } }));
// a getter, so each test can make the download fail
vi.mock('hls.js/light', () => ({ get default() { return hls.load(); } }));

class FakeHls {
  static Events = { ERROR: 'hlsError', BUFFER_CODECS: 'hlsBufferCodecs' };

  constructor(config) {
    this.config = config;
    this.handlers = {};
    hls.instances.push(this);
  }

  on(event, handler) { this.handlers[event] = handler; }

  loadSource() {}

  attachMedia() {}

  destroy() {}

  recoverMediaError() {}
}

function renderPlayer() {
  const store = createAppStore(createMemoryHistory());
  store.dispatch({
    type: Types.ACTION_ROUTES_METADATA,
    routes: [{ log_id: 'r', fullname: 'x|r', duration: 180000 }],
  });
  store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 'r', start: 0, end: 180000 });
  render(<Provider store={store}><DriveVideo /></Provider>);
  return store;
}

describe('DriveVideo', () => {
  beforeEach(() => {
    hls.instances = [];
    hls.load = () => FakeHls;
    window.MediaSource = class {};
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.load = vi.fn();
  });

  it('says the drive has no video when the playlist is missing, and retries on request', async () => {
    renderPlayer();
    await screen.findByRole('status');
    await act(async () => {});
    const [player] = hls.instances;
    act(() => player.handlers.hlsError('hlsError', { fatal: true, type: 'networkError', details: 'manifestLoadError', response: { code: 404 } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Video for this drive has not uploaded yet or has been deleted.');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(hls.instances).toHaveLength(2);
  });

  it('names a missing segment, ignores errors hls.js recovers from, and retries in another segment', async () => {
    const store = renderPlayer();
    await act(async () => {});
    const [player] = hls.instances;
    act(() => player.handlers.hlsError('hlsError', { fatal: false, type: 'mediaError', details: 'bufferStalledError' }));
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => player.handlers.hlsError('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError', response: { code: 404 } }));
    expect(screen.getByRole('alert')).toHaveTextContent('This video segment has not uploaded yet or has been deleted.');

    await act(async () => store.dispatch(seek(30000)));
    expect(hls.instances).toHaveLength(1);
    await act(async () => store.dispatch(seek(130000)));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(hls.instances).toHaveLength(2);
  });

  it('shows a network error when the player code cannot download', async () => {
    hls.load = () => { throw new TypeError('Failed to fetch dynamically imported module'); };
    renderPlayer();
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your network connection');
  });

  it('caps the speed at 2x only when it plays HLS natively', async () => {
    window.MediaSource = undefined;
    const store = renderPlayer();
    store.dispatch(play(4));
    expect(store.getState().desiredPlaySpeed).toEqual(2);
    cleanup();

    window.MediaSource = class {};
    const hlsStore = renderPlayer();
    await act(async () => {});
    hlsStore.dispatch(play(8));
    expect(hlsStore.getState().desiredPlaySpeed).toEqual(8);
  });

  it('starts no player for a drive the user already left', async () => {
    renderPlayer();
    cleanup();
    await act(async () => {});
    expect(hls.instances).toHaveLength(0);
  });

  it('starts at the requested time however long the player code takes to load', async () => {
    let now = 1000000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    hls.load = () => { now += 450; return FakeHls; };
    const store = createAppStore(createMemoryHistory());
    store.dispatch({ type: Types.ACTION_ROUTES_METADATA, routes: [{ log_id: 'r', fullname: 'x|r', duration: 180000 }] });
    store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 'r', start: 0, end: 180000 });
    store.dispatch(seek(150000));
    store.dispatch(play(1));
    render(<Provider store={store}><DriveVideo /></Provider>);
    await act(async () => {});
    expect(hls.instances[0].config.startPosition).toEqual(150);
    vi.restoreAllMocks();
  });

  it('leaves the picture alone when the drive closes', async () => {
    const store = renderPlayer();
    await act(async () => {});
    const video = document.querySelector('video');
    const seeks = [];
    Object.defineProperty(video, 'currentTime', { get: () => 42, set: (t) => seeks.push(t) });
    // hls.js has attached its stream and the video has started
    video.setAttribute('src', 'blob:stream');
    fireEvent.loadedMetadata(video);
    seeks.length = 0;
    HTMLMediaElement.prototype.load.mockClear();
    await act(async () => {
      store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: null, start: null, end: null });
      store.dispatch(resetPlayback());
      store.dispatch(selectLoop(null, null));
    });
    expect(seeks).toEqual([]);
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  });
});
