import React from 'react';
import { vi } from 'vitest';
import * as Redux from 'redux';
import { fireEvent, render, screen } from '@testing-library/react';
import TimeDisplay from './index';
import * as Types from '../../actions/types';

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

describe('TimeDisplay speed control', () => {
  it('shows the control on an iPhone', () => {
    withUserAgent(IPHONE_UA, () => {
      const store = makeStore();
      render(React.createElement(TimeDisplay, { store }));
      const up = screen.getByRole('button', { name: 'Increase play speed by 1 step' });
      const down = screen.getByRole('button', { name: 'Decrease play speed by 1 step' });
      fireEvent.click(up);
      expect(store.getState().desiredPlaySpeed).toBe(2);
      fireEvent.click(down);
      fireEvent.click(down);
      expect(store.getState().desiredPlaySpeed).toBe(0.5);
      expect(down).toBeEnabled(); // 0.25 and 0.1 are still below
    });
  });

  it('walks the list up to 8', () => {
    const store = makeStore();
    render(React.createElement(TimeDisplay, { store }));
    const up = screen.getByRole('button', { name: 'Increase play speed by 1 step' });
    fireEvent.click(up);
    fireEvent.click(up);
    fireEvent.click(up);
    expect(store.getState().desiredPlaySpeed).toBe(8);
    expect(up).toBeDisabled();
  });
});
