import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

import DriveVideo from '.';
import rootReducer from '../../reducers';
import { play, seek } from '../../timeline/playback';

const mocks = vi.hoisted(() => ({
  currentOffset: vi.fn(() => 0),
  mediaElement: {
    audioTracks: { length: 0 },
    addEventListener: vi.fn(),
    paused: true,
    play: vi.fn(),
    readyState: 4,
    removeEventListener: vi.fn(),
  },
  playerProps: null,
  seekTo: vi.fn(),
  getVideoUrl: vi.fn(() => 'https://video.example/route.m3u8'),
}));

vi.mock('../../timeline', () => ({
  currentOffset: mocks.currentOffset,
}));

vi.mock('../../api/backend', () => ({
  api: {
    video: {
      getQcameraStreamUrl: mocks.getVideoUrl,
    },
  },
}));

vi.mock('react-player/file', async () => {
  const ReactModule = await import('react');
  return {
    default: ReactModule.forwardRef((props, ref) => {
      mocks.playerProps = props;
      ReactModule.useImperativeHandle(ref, () => ({
        getInternalPlayer: (key) => (key === 'hls' ? null : mocks.mediaElement),
        seekTo: mocks.seekTo,
      }));
      return <div data-testid="react-player" />;
    }),
  };
});

function makeStore() {
  return createStore(rootReducer, {
    currentRoute: {
      fullname: 'device|route',
      videoStartOffset: 2000,
    },
    desiredPlaySpeed: 0,
    isBufferingVideo: false,
    loop: null,
    offset: 0,
    seekSequence: 0,
    startTime: Date.now(),
  });
}

describe('DriveVideo', () => {
  beforeEach(() => {
    mocks.currentOffset.mockReset().mockReturnValue(0);
    mocks.mediaElement.play.mockClear();
    mocks.playerProps = null;
    mocks.seekTo.mockReset();
    mocks.getVideoUrl.mockClear();
  });

  it('lets media progress update route time without issuing a seek', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <DriveVideo isMuted />
      </Provider>,
    );

    expect(screen.getByTestId('react-player')).toBeInTheDocument();
    act(() => mocks.playerProps.onProgress({ playedSeconds: 3 }));

    expect(store.getState().offset).toBe(5000);
    expect(store.getState().seekSequence).toBe(0);
    expect(mocks.seekTo).not.toHaveBeenCalled();
    expect(mocks.mediaElement.play).not.toHaveBeenCalled();
  });

  it('sends explicit timeline seeks to the media player', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <DriveVideo isMuted />
      </Provider>,
    );
    mocks.currentOffset.mockReturnValue(12000);

    act(() => store.dispatch(seek(12000)));

    expect(mocks.seekTo).toHaveBeenCalledWith(10, 'seconds');
  });

  it('starts the media when it is ready and playback is requested', () => {
    const store = makeStore();
    store.dispatch(play());
    render(
      <Provider store={store}>
        <DriveVideo isMuted />
      </Provider>,
    );

    expect(mocks.mediaElement.play).toHaveBeenCalledOnce();
  });
});
