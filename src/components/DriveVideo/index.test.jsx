import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

import DriveVideo from './index';
import { videoController, currentOffset } from '../../timeline';
import { seek, selectLoop } from '../../timeline/playback';
import rootReducer from '../../reducers';

// Mock react-player/file to provide controllable internal video element
const mockVideoListeners = {};
const mockVideoElement = {
  currentTime: 0,
  duration: 120,
  paused: true,
  playbackRate: 1,
  readyState: 4,
  audioTracks: [{ id: '1', kind: 'main' }],
  buffered: {
    length: 1,
    start: () => 0,
    end: () => 60,
  },
  play: vi.fn(async () => {
    mockVideoElement.paused = false;
  }),
  pause: vi.fn(() => {
    mockVideoElement.paused = true;
  }),
  addEventListener: vi.fn((event, handler) => {
    if (!mockVideoListeners[event]) {
      mockVideoListeners[event] = [];
    }
    mockVideoListeners[event].push(handler);
  }),
  removeEventListener: vi.fn((event, handler) => {
    if (mockVideoListeners[event]) {
      mockVideoListeners[event] = mockVideoListeners[event].filter((h) => h !== handler);
    }
  }),
  dispatchEvent: (event) => {
    const handlers = mockVideoListeners[event.type] || [];
    handlers.forEach((h) => h(event));
  },
};

const mockHlsListeners = {};
const mockHlsPlayer = {
  on: vi.fn((event, handler) => {
    mockHlsListeners[event] = handler;
  }),
};

let capturedPlayerProps = null;

vi.mock('react-player/file', () => ({
  default: React.forwardRef((props, ref) => {
    capturedPlayerProps = props;
    React.useImperativeHandle(ref, () => ({
      getInternalPlayer: (type) => {
        if (type === 'hls') return mockHlsPlayer;
        return mockVideoElement;
      },
      getCurrentTime: () => mockVideoElement.currentTime,
      getDuration: () => mockVideoElement.duration,
      seekTo: (sec) => {
        mockVideoElement.currentTime = sec;
      },
    }));

    const onReadyRef = React.useRef(props.onReady);
    onReadyRef.current = props.onReady;
    React.useLayoutEffect(() => {
      if (onReadyRef.current) {
        onReadyRef.current({
          getInternalPlayer: (type) => {
            if (type === 'hls') return mockHlsPlayer;
            return mockVideoElement;
          },
        });
      }
    }, [props.url]);

    return <div data-testid="mock-react-player" />;
  }),
}));

const mockRoute = {
  fullname: 'testdongle|2026-08-06--12-00-00',
  duration: 120000,
  videoStartOffset: 500,
  share_exp: 'exp123',
  share_sig: 'sig123',
};

function renderWithStore(initialStateOverride = {}) {
  const store = createStore(rootReducer, {
    currentRoute: mockRoute,
    desiredPlaySpeed: 1,
    offset: 0,
    isBufferingVideo: false,
    ...initialStateOverride,
  });

  const onAudioStatusChange = vi.fn();
  let utils;
  act(() => {
    utils = render(
      <Provider store={store}>
        <DriveVideo isMuted onAudioStatusChange={onAudioStatusChange} />
      </Provider>
    );
  });

  return { store, onAudioStatusChange, ...utils };
}

describe('DriveVideo & videoController video-driven architecture', () => {
  beforeEach(() => {
    Object.keys(mockVideoListeners).forEach((k) => delete mockVideoListeners[k]);
    Object.keys(mockHlsListeners).forEach((k) => delete mockHlsListeners[k]);
    mockVideoElement.currentTime = 0;
    mockVideoElement.paused = true;
    mockVideoElement.playbackRate = 1;
    mockVideoElement.readyState = 4;
    videoController.clear();
  });

  it('mounts and registers the video element with videoController', () => {
    renderWithStore();
    expect(videoController.hasActiveVideo()).toBe(true);
    expect(videoController.getVideoElement()).toBe(mockVideoElement);
  });

  it('authoritatively drives currentOffset from video.currentTime', () => {
    renderWithStore();

    // With videoStartOffset = 500ms, currentTime = 5s => offset = 5500ms
    mockVideoElement.currentTime = 5;
    expect(currentOffset()).toBe(5500);

    mockVideoElement.currentTime = 25.5;
    expect(currentOffset()).toBe(26000);
  });

  it('seeks video element when seek action is dispatched', () => {
    const { store } = renderWithStore();

    // Seek to 10500ms -> video time = (10500 - 500) / 1000 = 10s
    act(() => {
      store.dispatch(seek(10500));
    });
    expect(mockVideoElement.currentTime).toBe(10);
  });

  it('handles user seeking while loading before metadata is ready', () => {
    mockVideoElement.readyState = 0; // HAVE_NOTHING
    const { store } = renderWithStore();

    // User seeks while loading
    act(() => {
      store.dispatch(seek(15500));
    });
    expect(mockVideoElement.currentTime).toBe(0); // Pending

    // Once metadata loads:
    mockVideoElement.readyState = 1;
    act(() => {
      mockVideoElement.dispatchEvent(new Event('loadedmetadata'));
    });
    expect(mockVideoElement.currentTime).toBe(15);
  });

  it('handles loop boundary during timeupdate', () => {
    const { store } = renderWithStore();
    // Loop from 10000ms to 20000ms (duration 10000ms)
    act(() => {
      store.dispatch(selectLoop(10000, 20000));
    });

    // Video advances past loop end (20500ms route offset -> 20.0s video time)
    mockVideoElement.currentTime = 20.5;
    act(() => {
      mockVideoElement.dispatchEvent(new Event('timeupdate'));
    });

    // Should wrap to loop start (10000ms - 500ms videoStartOffset = 9.5s)
    expect(mockVideoElement.currentTime).toBe(9.5);
  });

  it('wraps to loop start when video ends if loop is active', () => {
    const { store } = renderWithStore();
    act(() => {
      store.dispatch(selectLoop(10000, 20000));
    });

    mockVideoElement.currentTime = 120;
    act(() => {
      mockVideoElement.dispatchEvent(new Event('ended'));
    });

    expect(mockVideoElement.currentTime).toBe(9.5);
    expect(mockVideoElement.play).toHaveBeenCalled();
  });

  it('pauses playback when route ends without loop', () => {
    const { store } = renderWithStore({ desiredPlaySpeed: 1 });
    act(() => {
      mockVideoElement.dispatchEvent(new Event('ended'));
    });
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('handles native waiting and canplay events for buffering state', () => {
    const { store } = renderWithStore({ desiredPlaySpeed: 1 });

    act(() => {
      mockVideoElement.dispatchEvent(new Event('waiting'));
    });
    expect(store.getState().isBufferingVideo).toBe(true);

    act(() => {
      mockVideoElement.dispatchEvent(new Event('canplay'));
    });
    expect(store.getState().isBufferingVideo).toBe(false);
  });

  it('displays user-friendly error message on 404 missing segment error with retry button', () => {
    renderWithStore();

    act(() => {
      capturedPlayerProps.onError('hlsError', {
        type: 'networkError',
        response: { code: 404 },
      });
    });

    expect(screen.getByText('This video segment has not uploaded yet or has been deleted.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

    // Clicking retry resets error state
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });
    expect(screen.queryByText('This video segment has not uploaded yet or has been deleted.')).not.toBeInTheDocument();
  });

  it('displays user-friendly network connection error on network failure', () => {
    renderWithStore();

    act(() => {
      capturedPlayerProps.onError('hlsError', {
        type: 'networkError',
        response: { code: 500 },
      });
    });

    expect(screen.getByText('Unable to load video. Check network connection.')).toBeInTheDocument();
  });

  it('notifies audio status change via hlsBufferCodecs on non-iOS', () => {
    const { onAudioStatusChange } = renderWithStore();

    expect(mockHlsListeners.hlsBufferCodecs).toBeDefined();
    act(() => {
      mockHlsListeners.hlsBufferCodecs(null, { audio: true });
    });
    expect(onAudioStatusChange).toHaveBeenCalledWith(true);
  });

  it('cleans up videoController when unmounted', () => {
    const { unmount } = renderWithStore();
    expect(videoController.hasActiveVideo()).toBe(true);

    unmount();
    expect(videoController.hasActiveVideo()).toBe(false);
    expect(videoController.getVideoElement()).toBe(null);
  });
});
