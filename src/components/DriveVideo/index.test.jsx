import React from 'react';
import { Provider } from 'react-redux';
import * as Redux from 'redux';
import thunk from 'redux-thunk';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import DriveVideo from '.';
import { attachVideo, currentOffset } from '../../timeline';
import { reducer, seek } from '../../timeline/playback';

const hls = vi.hoisted(() => ({ instances: [] }));

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (name) => `https://example.com/${name}/qcamera.m3u8` } },
}));
vi.mock('hls.js/dist/hls.light.mjs', () => ({
  default: class FakeHls {
    static Events = { BUFFER_CODECS: 'hlsBufferCodecs', ERROR: 'hlsError' };
    static isSupported() { return true; }
    constructor(config) { this.config = config; this.handlers = {}; hls.instances.push(this); }
    on(event, handler) { this.handlers[event] = handler; }
    emit(event, data) { this.handlers[event]?.(event, data); }
    loadSource() {}
    attachMedia() {}
    stopLoad() {}
    destroy() {}
  },
}));

const route = { fullname: 'a|b', videoStartOffset: 1000, duration: 120000 };

async function setup(state = {}) {
  hls.instances = [];
  const store = Redux.createStore(reducer, {
    desiredPlaySpeed: 1, offset: 5000, loop: null, currentRoute: route, ...state,
  }, Redux.applyMiddleware(thunk));
  render(<Provider store={store}><DriveVideo isMuted /></Provider>);
  await waitFor(() => expect(hls.instances).toHaveLength(1));
  const video = document.querySelector('video');
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  return { store, video };
}

describe('DriveVideo', () => {
  afterEach(() => {
    attachVideo(null);
    vi.restoreAllMocks();
  });

  it('becomes the playback clock once it has loaded', async () => {
    const { store, video } = await setup();
    expect(hls.instances[0].config.startPosition).toEqual(4);

    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toEqual(4);

    video.currentTime = 10;
    expect(currentOffset(store.getState())).toEqual(11000);
  });

  it('follows a pause from outside the app', async () => {
    const { store, video } = await setup();
    fireEvent.loadedMetadata(video);

    fireEvent.pause(video);
    expect(store.getState().desiredPlaySpeed).toEqual(0);
  });

  it('hides the spinner when a seek ends in the same tick', async () => {
    const { video } = await setup();
    fireEvent.loadedMetadata(video);
    fireEvent.canPlay(video);
    expect(screen.queryByRole('progressbar')).toBeNull();

    act(() => {
      fireEvent.seeking(video);
      fireEvent.seeked(video);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('asks for a tap when autoplay is blocked', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
    const { store, video } = await setup();
    fireEvent.loadedMetadata(video);

    const button = await screen.findByLabelText('Play');
    expect(store.getState().desiredPlaySpeed).toEqual(0);

    fireEvent.click(button);
    expect(store.getState().desiredPlaySpeed).toEqual(1);
    play.mockRestore();
  });

  it('redraws a paused video when iOS brings the app back', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
      fireEvent.play(this);
      this.currentTime += 0.05;
      return Promise.resolve();
    });
    const store = Redux.createStore(reducer, {
      desiredPlaySpeed: 0, offset: 5000, loop: null, currentRoute: route,
    }, Redux.applyMiddleware(thunk));
    render(<Provider store={store}><DriveVideo isMuted={false} /></Provider>);
    const video = document.querySelector('video');
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    fireEvent.loadedMetadata(video);
    video.currentTime = 30;

    await act(async () => fireEvent(document, new Event('visibilitychange')));
    expect(play).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toEqual(30);
    expect(video.muted).toBe(false);
    expect(store.getState().desiredPlaySpeed).toEqual(0);
  });

  it('only reports a missing segment once playback reaches it', async () => {
    const { store, video } = await setup();
    fireEvent.loadedMetadata(video);

    act(() => hls.instances[0].emit('hlsError', {
      type: 'networkError', fatal: false, frag: { start: 60 }, response: { code: 404 },
    }));
    fireEvent.waiting(video);
    expect(screen.queryByText(/has not uploaded yet/)).toBeNull();

    video.currentTime = 59.8;
    fireEvent.waiting(video);
    expect(await screen.findByText('This part of the drive has not uploaded yet or has been deleted.')).toBeTruthy();

    // seeking away starts over from the new position
    act(() => store.dispatch(seek(90000)));
    await waitFor(() => expect(hls.instances).toHaveLength(2));
    expect(hls.instances[1].config.startPosition).toEqual(89);
    expect(screen.queryByText(/has not uploaded yet/)).toBeNull();
  });
});
