import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Provider } from 'react-redux';

import { createInitialState } from '../../initialState';
import appStore, { createAppStore } from '../../store';
import { currentOffset } from '../../timeline';
import { pause, play, resetPlayback, seek, selectLoop } from '../../timeline/playback';
import DriveVideo from '.';

const hls = vi.hoisted(() => ({ instances: [], supported: true }));
vi.mock('hls.js', () => {
  class Hls {
    static isSupported() { return hls.supported; }
    static Events = { BUFFER_CODECS: 'codecs', ERROR: 'error' };
    static ErrorTypes = { MEDIA_ERROR: 'mediaError', NETWORK_ERROR: 'networkError' };

    constructor(config) {
      this.config = config;
      this.handlers = {};
      this.recoverMediaError = vi.fn();
      hls.instances.push(this);
    }

    on(name, handler) { this.handlers[name] = handler; }
    emit(name, data) { this.handlers[name](name, data); }
    loadSource(url) { this.url = url; }
    attachMedia(video) { this.video = video; }
    destroy() { this.destroyed = true; }
  }
  return { default: Hls };
});

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (fullname) => `https://video.test/${fullname}/qcamera.m3u8` } },
}));

const ROUTE = { fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00', duration: 60000, videoStartOffset: 2000 };

function setup({ route = ROUTE, state = {}, props = {} } = {}) {
  const store = createAppStore(createMemoryHistory(), {
    ...createInitialState('/'), currentRoute: route, offset: 5000, startTime: Date.now(), ...state,
  });
  // currentOffset() reads the app's store when no video is playing; here that's the one under test
  vi.spyOn(appStore, 'getState').mockImplementation(() => store.getState());
  const onAudioStatusChange = vi.fn();
  const view = render(
    <Provider store={store}>
      <DriveVideo isMuted onAudioStatusChange={onAudioStatusChange} {...props} />
    </Provider>,
  );
  return { store, onAudioStatusChange, video: view.container.querySelector('video'), ...view };
}

// A video that does what the test says it does.
const START = 3; // seconds: the playhead is at 5s and the video starts 2s into the route

function control(video) {
  const fake = { currentTime: 0, readyState: 0, paused: true, playbackRate: 1 };
  Object.keys(fake).forEach((key) => Object.defineProperty(video, key, {
    get: () => fake[key], set: (value) => { fake[key] = value; }, configurable: true,
  }));
  video.play = vi.fn(async () => { fake.paused = false; });
  video.pause = vi.fn(() => {
    fake.paused = true;
    video.dispatchEvent(new Event('pause'));
  });
  return {
    fake,
    emit: (name, changes = {}) => act(() => {
      Object.assign(fake, changes);
      video.dispatchEvent(new Event(name));
    }),
    move: (currentTime, changes = {}) => act(() => {
      Object.assign(fake, { currentTime }, changes);
      video.dispatchEvent(new Event('timeupdate'));
    }),
    load: (changes = {}) => act(() => {
      Object.assign(fake, { readyState: 4, currentTime: START }, changes);
      video.dispatchEvent(new Event('loadedmetadata'));
    }),
  };
}

// dispatch() returns a promise (the history middleware is async), which act() must not be handed
const dispatchInAct = (store, action) => act(() => { store.dispatch(action); });

const loaded = () => waitFor(() => expect(hls.instances).toHaveLength(1));

afterEach(() => {
  vi.restoreAllMocks();
});

beforeAll(() => {
  // jsdom doesn't implement media loading; unmounting calls this after the last assertion
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { value: () => {}, configurable: true });
});

beforeEach(() => {
  hls.instances.length = 0;
  hls.supported = true;
});

describe('DriveVideo', () => {
  it('streams the route from where the playhead is', async () => {
    const { video } = setup();
    await loaded();
    const [stream] = hls.instances;
    expect(stream.url).toBe(`https://video.test/${ROUTE.fullname}/qcamera.m3u8`);
    expect(stream.video).toBe(video);
    expect(stream.config.startPosition).toBe(3); // offset 5s, the video starts 2s in
  });

  it('loads only a little ahead at normal speed, and more as it speeds up', async () => {
    const { store } = setup();
    await loaded();
    expect(hls.instances[0].config.maxBufferLength).toBe(10);
    dispatchInAct(store, play(8));
    expect(hls.instances[0].config.maxBufferLength).toBe(32);
    dispatchInAct(store, pause());
    expect(hls.instances[0].config.maxBufferLength).toBe(10);
  });

  it('streams again, from the playhead, when the route changes', async () => {
    const { store } = setup();
    await loaded();
    expect(store).toBeDefined();
    const other = setup({ route: { ...ROUTE, fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--13-00-00' } });
    await waitFor(() => expect(hls.instances).toHaveLength(2));
    expect(hls.instances[1].url).toContain('13-00-00');
    other.unmount();
  });

  it('tears the stream down when it goes away', async () => {
    const { unmount } = setup();
    await loaded();
    unmount();
    expect(hls.instances[0].destroyed).toBe(true);
  });

  it('is buffering until the video has data, and says so when it runs dry', async () => {
    const { store, video } = setup();
    const controls = control(video);
    await loaded();
    expect(screen.getByRole('status', { name: 'Buffering' })).toBeVisible();

    controls.load({ readyState: 4 });
    controls.emit('canplay');
    expect(store.getState().isBufferingVideo).toBe(false);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    controls.emit('waiting', { readyState: 1, paused: false });
    expect(store.getState().isBufferingVideo).toBe(true);
    expect(screen.getByRole('status', { name: 'Buffering' })).toBeVisible();

    controls.emit('playing', { readyState: 4 });
    expect(store.getState().isBufferingVideo).toBe(false);
  });

  it('does not call a paused video with its frame buffering', async () => {
    const { store, video } = setup({ state: { desiredPlaySpeed: 0 } });
    const controls = control(video);
    await loaded();
    controls.load({ readyState: 2, paused: true });
    expect(store.getState().isBufferingVideo).toBe(false);
  });

  it('is where the video is', async () => {
    const { video } = setup();
    const controls = control(video);
    await loaded();
    controls.load();
    controls.move(20);
    expect(currentOffset()).toBe(22000); // 20s in, the video starts 2s in
    controls.move(21);
    expect(currentOffset()).toBe(23000);
  });

  it('plays, changes speed and pauses when asked', async () => {
    const { store, video } = setup();
    const controls = control(video);
    await loaded();
    controls.load();
    expect(video.play).toHaveBeenCalledOnce();

    controls.fake.paused = false;
    dispatchInAct(store, play(4));
    expect(video.playbackRate).toBe(4);
    expect(video.play).toHaveBeenCalledOnce();

    dispatchInAct(store, pause());
    expect(video.pause).toHaveBeenCalledOnce();

    dispatchInAct(store, play(1));
    expect(video.play).toHaveBeenCalledTimes(2);
  });

  it('keeps the place the video was paused at', async () => {
    const { store, video } = setup();
    const controls = control(video);
    await loaded();
    controls.load({ paused: false });
    controls.move(12);
    dispatchInAct(store, pause());
    expect(store.getState().offset).toBe(14000);
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('is paused rather than stuck when the browser wants a tap before playing', async () => {
    const { store, video } = setup();
    const controls = control(video);
    video.play = vi.fn(() => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
    await loaded();
    controls.load();
    await waitFor(() => expect(store.getState().desiredPlaySpeed).toBe(0));
  });

  it('stops at the end', async () => {
    const { store, video } = setup();
    const controls = control(video);
    await loaded();
    controls.load({ paused: false });
    controls.move(58);
    controls.emit('ended');
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(store.getState().offset).toBe(60000);
  });

  it('goes where the user seeks', async () => {
    const { store, video } = setup();
    const controls = control(video);
    await loaded();
    controls.load();
    dispatchInAct(store, seek(30000));
    expect(video.currentTime).toBe(28);
    dispatchInAct(store, seek(1000));
    expect(video.currentTime).toBe(0); // before the first frame
  });

  it('goes where the user seeked while it was still loading', async () => {
    const { store, video } = setup();
    const controls = control(video);
    await loaded();
    dispatchInAct(store, seek(42000));
    controls.load();
    expect(video.currentTime).toBe(40);
  });

  it('does not go back to a seek that was made before it was shown', async () => {
    const { video } = setup({ state: { seekTo: { offset: 50000 } } });
    const controls = control(video);
    await loaded();
    controls.load();
    expect(video.currentTime).toBe(START);
  });

  it('starts at the new playhead when a route is reset', async () => {
    const { store, video } = setup();
    const controls = control(video);
    await loaded();
    controls.load();
    controls.move(30);
    dispatchInAct(store, resetPlayback());
    expect(video.currentTime).toBe(0);
  });

  it('plays round the selected loop', async () => {
    const { store, video } = setup();
    const controls = control(video);
    await loaded();
    controls.load({ paused: false });
    controls.move(10);
    dispatchInAct(store, selectLoop(10000, 15000));
    controls.fake.currentTime = 14; // 16s into the route, past the end of the loop
    await waitFor(() => expect(video.currentTime).toBe(8)); // back to 10s into the route
  });

  it('leaves the playhead where the video was, and carries on from there, when it goes away', async () => {
    const { store, video, unmount } = setup();
    const controls = control(video);
    await loaded();
    controls.load();
    controls.move(20);
    controls.emit('canplay');
    unmount();
    expect(store.getState().isBufferingVideo).toBe(false);
    expect(store.getState().offset).toBe(22000);
  });

  describe('when it cannot play', () => {
    const fatal = (data) => act(() => hls.instances.at(-1).emit('error', { fatal: true, ...data }));

    it('says the video has not uploaded when the stream is missing', async () => {
      setup();
      await loaded();
      fatal({ type: 'networkError', response: { code: 404 } });
      expect(screen.getByText('This video segment has not uploaded yet or has been deleted.')).toBeVisible();
    });

    it('says the network is the problem when it is', async () => {
      setup();
      await loaded();
      fatal({ type: 'networkError', response: { code: 503 } });
      expect(screen.getByText('Unable to load video. Check network connection.')).toBeVisible();
    });

    it('ignores errors that hls.js recovers from by itself', async () => {
      setup();
      await loaded();
      act(() => hls.instances[0].emit('error', { fatal: false, type: 'mediaError', details: 'bufferStalledError' }));
      expect(screen.queryByText(/Unable to load video/)).not.toBeInTheDocument();
    });

    it('recovers a broken decoder once, then gives up', async () => {
      setup();
      await loaded();
      fatal({ type: 'mediaError' });
      expect(hls.instances[0].recoverMediaError).toHaveBeenCalledOnce();
      expect(screen.queryByText('Unable to load video')).not.toBeInTheDocument();
      fatal({ type: 'mediaError' });
      expect(screen.getByText('Unable to load video')).toBeVisible();
    });

    it('tries again from the same place when asked', async () => {
      const { video } = setup();
      const controls = control(video);
      await loaded();
      controls.load();
      controls.move(12);
      fatal({ type: 'networkError', response: { code: 503 } });
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(hls.instances).toHaveLength(2));
      expect(hls.instances[0].destroyed).toBe(true);
      expect(hls.instances[1].config.startPosition).toBe(12);
      expect(screen.queryByText(/Unable to load video/)).not.toBeInTheDocument();
    });

    it('clears the error once the video plays again', async () => {
      const { video } = setup();
      const controls = control(video);
      await loaded();
      fatal({ type: 'networkError' });
      controls.emit('playing', { readyState: 4 });
      expect(screen.queryByText(/Unable to load video/)).not.toBeInTheDocument();
    });

    it('says so when the browser cannot play streams at all', async () => {
      hls.supported = false;
      setup();
      expect(await screen.findByText('This browser cannot play this video.')).toBeVisible();
    });
  });

  describe('audio', () => {
    it('is reported from the stream', async () => {
      const { onAudioStatusChange } = setup();
      await loaded();
      act(() => hls.instances[0].emit('codecs', { audio: { codec: 'mp4a' } }));
      expect(onAudioStatusChange).toHaveBeenLastCalledWith(true);
      act(() => hls.instances[0].emit('codecs', {}));
      expect(onAudioStatusChange).toHaveBeenLastCalledWith(false);
    });
  });

  describe('on iOS', () => {
    beforeEach(() => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    });

    it('lets the system play the stream', async () => {
      const { video } = setup();
      expect(video.getAttribute('src')).toBe(`https://video.test/${ROUTE.fullname}/qcamera.m3u8`);
      expect(hls.instances).toHaveLength(0);
    });

    it('starts where the playhead is, and reports audio the system finds', async () => {
      const { video, onAudioStatusChange } = setup();
      const controls = control(video);
      Object.defineProperty(video, 'audioTracks', { value: { length: 1 }, configurable: true });
      controls.load({ currentTime: 0 });
      expect(video.currentTime).toBe(3);
      expect(onAudioStatusChange).toHaveBeenLastCalledWith(true);
    });

    it('reports what the system could not play', async () => {
      const { video } = setup();
      Object.defineProperty(video, 'error', { value: { code: 2 }, configurable: true });
      act(() => { video.dispatchEvent(new Event('error')); });
      expect(screen.getByText('Unable to load video. Check network connection.')).toBeVisible();
    });
  });
});
