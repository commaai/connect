import React from 'react';
import { Provider } from 'react-redux';
import { fireEvent, render, screen } from '@testing-library/react';

import DriveView from '.';

vi.mock('./Media', () => ({ default: ({ renderHeader }) => renderHeader(null) }));
vi.mock('../../actions', () => ({
  popTimelineRange: (logId) => ({ type: 'pop', logId }),
  pushTimelineRange: (...args) => ({ type: 'push', args }),
}));
vi.mock('../../actions/cached', () => ({ fetchLocations: () => ({ type: 'locations' }) }));

const route = {
  log_id: 'LOG',
  fullname: 'dongle|LOG',
  start_time_utc_millis: Date.UTC(2026, 1, 25, 12),
  duration: 60000,
  distance: 10.2,
  startLocation: { place: 'Old Town' },
  endLocation: { place: 'University City' },
};
const whole = { start: 0, end: 60000, previous: null };

function renderView(zoom) {
  const store = { getState: () => ({ routes: [route], zoom, currentRoute: route }), subscribe: () => () => {}, dispatch: vi.fn() };
  render(<Provider store={store}><DriveView /></Provider>);
  return store;
}

describe('DriveView', () => {
  it('shows distance, places and duration for the whole drive', () => {
    renderView(whole);
    expect(screen.getByText(/(10\.2 mi|16\.4 km) · Old Town → University City · 1 min/)).toBeTruthy();
  });

  it('goes back through the previous zoom first', () => {
    const store = renderView({ start: 10000, end: 20000, previous: whole });
    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'pop', logId: 'LOG' });
  });

  it('zooms out to the whole drive when there is no previous zoom', () => {
    const store = renderView({ start: 10000, end: 20000, previous: null });
    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'push', args: ['LOG', null, null] });
  });

  it('leaves for the drive list from the whole drive, even after zooming out of a range', () => {
    const store = renderView({ ...whole, previous: { start: 10000, end: 20000, previous: null } });
    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'push', args: [null, null, null] });
  });
});
