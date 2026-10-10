import React from 'react';
import { vi } from 'vitest';
import * as Redux from 'redux';
import { fireEvent, render, screen } from '@testing-library/react';
import TimeDisplay, { speedSteps } from './index';
import * as Types from '../../actions/types';
import { attachVideo, detachVideo, getVideo } from '../../timeline/video';

vi.mock('../../timeline', () => ({ currentOffset: vi.fn(() => 0) }));

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) '
  + 'Version/26.6 Mobile/15E148 Safari/604.1';

function makeStore() {
  return Redux.createStore((state = { currentRoute: { start_time_utc_millis: 1570830798378 }, zoom: true, desiredPlaySpeed: 1 }, action) => {
    if (action.type === Types.ACTION_PLAY) {
      return { ...state, desiredPlaySpeed: action.speed };
    }
    return state;
  });
}

function withUserAgent(userAgent, fn) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
  try {
    fn();
  } finally {
    delete window.navigator.userAgent;
  }
}

describe('TimeDisplay speed steps', () => {
  afterEach(() => detachVideo(getVideo()));

  it('caps native HLS at 2x and offers the full list otherwise', () => {
    expect(speedSteps(true)).toEqual([0.5, 1, 2]);
    expect(speedSteps(false)).toEqual([0.1, 0.25, 0.5, 1, 2, 4, 8]);
  });

  it('decides from the attached element, falling back to the user agent before one is attached', () => {
    // jsdom's user agent is not iOS, so the fallback is the full list
    expect(speedSteps()).toEqual([0.1, 0.25, 0.5, 1, 2, 4, 8]);
    attachVideo({ currentSrc: 'https://api.commadotai.com/v1/route/qcamera.m3u8', readyState: 4 });
    expect(speedSteps()).toEqual([0.5, 1, 2]);
    attachVideo({ currentSrc: 'blob:http://localhost:3001/0c1d-4e2f', readyState: 4 });
    expect(speedSteps()).toEqual([0.1, 0.25, 0.5, 1, 2, 4, 8]);
  });
});

describe('TimeDisplay speed control', () => {
  afterEach(() => detachVideo(getVideo()));

  it('shows the control on an iPhone and stops at 2x on a native element', () => {
    attachVideo({ currentSrc: 'https://api.commadotai.com/v1/route/qcamera.m3u8', readyState: 4 });
    withUserAgent(IPHONE_UA, () => {
      const store = makeStore();
      render(React.createElement(TimeDisplay, { store }));
      const up = screen.getByRole('button', { name: 'Increase play speed by 1 step' });
      const down = screen.getByRole('button', { name: 'Decrease play speed by 1 step' });
      expect(up).toBeEnabled();
      fireEvent.click(up);
      expect(store.getState().desiredPlaySpeed).toBe(2);
      expect(up).toBeDisabled(); // 2 is the last native step
      fireEvent.click(down);
      fireEvent.click(down);
      expect(store.getState().desiredPlaySpeed).toBe(0.5);
      expect(down).toBeDisabled();
    });
  });

  it('offers the full list on hls.js', () => {
    attachVideo({ currentSrc: 'blob:http://localhost:3001/0c1d-4e2f', readyState: 4 });
    const store = makeStore();
    render(React.createElement(TimeDisplay, { store }));
    const up = screen.getByRole('button', { name: 'Increase play speed by 1 step' });
    fireEvent.click(up);
    fireEvent.click(up);
    expect(store.getState().desiredPlaySpeed).toBe(4);
    expect(up).toBeEnabled(); // 8 is still ahead
  });
});
