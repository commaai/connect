/* eslint-env jest */
import React from 'react';
import * as Redux from 'redux';
import thunk from 'redux-thunk';
import { render, screen } from '@testing-library/react';
import DriveListItem from './DriveListItem';

const defaultState = {
  start: Date.now(),
};

jest.mock('../Timeline');

const store = Redux.createStore((state) => {
  if (!state) {
    return { ...defaultState };
  }
  return state;
}, Redux.applyMiddleware(thunk));

describe('drive list items', () => {
  it('has DriveEntry class', () => {
    render(<DriveListItem
      store={store}
      drive={{
        start_time_utc_millis: 1570830798378,
        end_time_utc_millis: 1570830798378 + 1234,
        length: 12.5212,
        startCoord: [0, 0],
        endCoord: [0, 0],
      }}
    />);
    expect(screen.getByRole('link')).toHaveClass('DriveEntry');
  });
});
