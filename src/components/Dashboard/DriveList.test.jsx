/* eslint-env jest */
import React from 'react';
import * as Redux from 'redux';
import thunk from 'redux-thunk';
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
import DriveList from './DriveList';

jest.mock('../../api', () => ({
  devices: { fetchDeviceStats: jest.fn(() => Promise.resolve({ all: { distance: 0, routes: 0, minutes: 0 } })) },
}));
jest.mock('../VisibilityHandler', () => () => null);
jest.mock('../TimeSelect', () => () => null);
jest.mock('./DriveListEmpty', () => () => null);
jest.mock('./DriveListItem', () => () => null);
jest.mock('../ScrollIntoView', () => ({ children }) => children);

const preserved = (n) => Array.from({ length: n }, (_, i) => ({
  fullname: `d|${i}`,
  dongle_id: 'dongleA',
  log_id: `log${i}`,
  is_preserved: true,
  start_time_utc_millis: 1000 - i,
  end_time_utc_millis: 2000 - i,
}));

const mixedRoutes = [
  ...preserved(2),
  {
    fullname: 'd|mixed',
    dongle_id: 'dongleA',
    log_id: 'logMixed',
    is_preserved: false,
    start_time_utc_millis: 500,
    end_time_utc_millis: 1500,
  },
];

const baseState = {
  dongleId: 'dongleA',
  device: { prime: false, is_owner: true, shared: true, dongle_id: 'dongleA' },
  routesMeta: { dongleId: 'dongleA', start: 1, end: 2 },
  limit: 5,
  segmentRange: null,
  filter: { start: 1, end: 2 },
  lastRoutes: null,
};

function renderWithState(state) {
  const store = Redux.createStore(
    (s) => s ?? state,
    state,
    Redux.applyMiddleware(thunk),
  );
  return render(
    <Provider store={store}>
      <DriveList />
    </Provider>,
  );
}

describe('DriveList preserved routes cue', () => {
  it('shows status cue for exhausted all-preserved free list', () => {
    renderWithState({ ...baseState, routes: preserved(3) });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Preserved routes');
  });

  it('hides status cue when routes are mixed', () => {
    renderWithState({ ...baseState, routes: mixedRoutes });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
