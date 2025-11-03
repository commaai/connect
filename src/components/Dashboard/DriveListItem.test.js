/* eslint-env jest */

import { render, screen } from '@testing-library/react';
import * as Redux from 'redux';
import { Provider } from 'react-redux';
import thunk from 'redux-thunk';
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
    render(
      <Provider store={store}>
        <DriveListItem
          drive={{
            fullname: '1d3dc3e03047b0c7/000000dd--455f14369d',
            dongle_id: '1d3dc3e03047b0c7',
            log_id: '000000dd--455f14369d',
            start_time_utc_millis: 1570830798378,
            end_time_utc_millis: 1570830798378 + 1234,
            distance: 12.5212,
            duration: 1234,
          }}
        />
      </Provider>,
    );
    expect(screen.getByRole('link')).toHaveClass('DriveEntry');
  });
});
