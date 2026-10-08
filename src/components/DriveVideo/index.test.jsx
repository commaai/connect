import { vi } from 'vitest';
import React from 'react';
import * as Redux from 'redux';
import thunk from 'redux-thunk';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { currentOffset } from '../../timeline';
import { reducer } from '../../timeline/playback';
import DriveVideo from '.';

const mocks = vi.hoisted(() => ({ store: null, player: null, hls: null }));

vi.mock('../../store', () => ({
  default: {
    getState: () => mocks.store.getState(),
    dispatch: (action) => mocks.store.dispatch(action),
    subscribe: (listener) => mocks.store.subscribe(listener),
  },
}));

vi.mock('react-player/file', async () => {
  const { forwardRef, useImperativeHandle, useRef } = await import('react');
  return {
    default: forwardRef((props, ref) => {
      const video = useRef();
      useImperativeHandle(ref, () => ({ getInternalPlayer: (key) => (key === 'hls' ? mocks.hls : video.current) }));
      mocks.player = props;
      return <video ref={video} data-testid="video" {...props.config.attributes} />;
    }),
  };
});

function setup() {
  mocks.hls = { startLoad: vi.fn(), on: vi.fn() };
  mocks.store = Redux.createStore(reducer, {
    desiredPlaySpeed: 1,
    offset: 12000,
    loop: { startTime: 0, duration: 60000 },
    currentRoute: { fullname: 'dongle|route', videoStartOffset: 2000 },
  }, Redux.applyMiddleware(thunk));

  render(<DriveVideo store={mocks.store} isMuted />);
  const video = screen.getByTestId('video');
  Object.defineProperties(video, {
    currentTime: { value: 0, writable: true },
    paused: { value: true, writable: true },
    readyState: { value: 4, writable: true },
    play: { value: vi.fn(() => Promise.resolve()) },
  });
  fireEvent.loadedMetadata(video);
  return video;
}

describe('DriveVideo', () => {
  it('becomes the playback clock once it has loaded', () => {
    const video = setup();
    expect(video.currentTime).toEqual(10);
    expect(video.play).toHaveBeenCalled();

    video.currentTime = 30;
    expect(currentOffset()).toEqual(32000);

    // a repeated loadedmetadata must not jump back to the last seek
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toEqual(30);
  });

  it('wraps playback at the end of the loop', () => {
    const video = setup();
    video.paused = false;
    video.currentTime = 59;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toEqual(0);
  });

  it('asks for a tap when autoplay is blocked', () => {
    const video = setup();
    act(() => mocks.player.onError(new DOMException('blocked', 'NotAllowedError')));
    expect(mocks.store.getState().desiredPlaySpeed).toEqual(0);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(mocks.store.getState().desiredPlaySpeed).toEqual(1);
  });

  it('skips a segment that was never uploaded', () => {
    const video = setup();
    act(() => mocks.player.onError('hlsError', { fatal: false, response: { code: 404 }, frag: { start: 60, duration: 60 } }));
    expect(video.currentTime).toEqual(120);
    expect(mocks.hls.startLoad).toHaveBeenCalledWith(120);
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('recovers once, then offers a retry', () => {
    setup();
    const fatal = { fatal: true, type: 'networkError' };
    act(() => mocks.player.onError('hlsError', { fatal: false }));
    act(() => mocks.player.onError('hlsError', fatal));
    expect(mocks.hls.startLoad).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Retry')).toBeNull();

    act(() => mocks.player.onError('hlsError', fatal));
    expect(screen.getByText('Unable to load video')).toBeVisible();

    fireEvent.click(screen.getByText('Retry'));
    expect(screen.queryByText('Unable to load video')).toBeNull();
    expect(mocks.store.getState().offset).toEqual(12000);
  });
});
