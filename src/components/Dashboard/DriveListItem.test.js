import { vi } from 'vitest';
import React from 'react';
import * as Redux from 'redux';
import thunk from 'redux-thunk';
import { render, screen } from '@testing-library/react';
import DriveListItem from './DriveListItem';

const defaultState = {
  start: Date.now(),
};

vi.mock('../Timeline', () => ({ default: () => null }));
vi.mock('../../timeline', () => ({ currentOffset: vi.fn(() => 0) }));

const store = Redux.createStore((state) => {
  if (!state) {
    return { ...defaultState };
  }
  return state;
}, Redux.applyMiddleware(thunk));

describe('drive list items', () => {
  it('has DriveEntry class', () => {
    render(React.createElement(DriveListItem, {
      store,
      drive: {
        fullname: '1d3dc3e03047b0c7/000000dd--455f14369d',
        dongle_id: '1d3dc3e03047b0c7',
        log_id: '000000dd--455f14369d',
        start_time_utc_millis: 1570830798378,
        end_time_utc_millis: 1570830798378 + 1234,
        distance: 12.5212,
        duration: 1234,
      },
    }));
    expect(screen.getByRole('link')).toHaveClass('DriveEntry');
  });
});
