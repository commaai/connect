import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import thunk from 'redux-thunk';
import { createStore } from 'redux';
import { applyMiddleware } from 'redux';

import Media from './Media';

vi.mock('./ClipMenu', () => ({ default: () => null }));
vi.mock('../Files/UploadQueue', () => ({ default: () => null }));

const route = {
  fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00',
  segment_end_times: [60_000],
  segment_numbers: [0],
  segment_start_times: [0],
  start_time_utc_millis: 0,
};

function renderMedia() {
  const state = {
    currentRoute: route,
    device: { dongle_id: 'aaaaaaaaaaaaaaaa', is_owner: true },
    files: {
      [`${route.fullname}--0/cameras`]: { url: 'https://files.example.com/fcamera.hevc' },
    },
    loop: { duration: 60_000, startTime: 0 },
    profile: { superuser: false },
    routes: [],
    zoom: { end: 60_000, start: 0 },
  };
  const store = createStore(currentState => currentState, state, applyMiddleware(thunk));

  return render(
    <Provider store={store}>
      <Media menusOnly />
    </Provider>,
  );
}

describe('file menu scope labels', () => {
  test('identifies individual file actions as applying to the current segment', () => {
    renderMedia();

    expect(screen.getByText('Road camera (current segment)')).toBeInTheDocument();
    expect(screen.getByText('Wide road camera (current segment)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'download' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'request upload' })).toHaveLength(3);
  });

  test('identifies All logs and All files as applying to the selected range', () => {
    renderMedia();

    expect(screen.getByText('All logs (selected range)')).toBeInTheDocument();
    expect(screen.getByText('All files (selected range)')).toBeInTheDocument();
  });
});
