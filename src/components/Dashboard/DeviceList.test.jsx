import React from 'react';
import { Provider } from 'react-redux';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { createAppStore } from '../../store';
import { createInitialState } from '../../initialState';
import DeviceList from './DeviceList';

vi.mock('../VisibilityHandler', () => ({ default: () => null }));
vi.mock('./AddDevice', () => ({ default: () => null }));
vi.mock('../../api/backend', () => ({
  api: {
    auth: { isAuthenticated: () => true },
    devices: {},
    routes: {},
  },
}));
vi.mock('../../actions/history', () => ({
  onHistoryMiddleware: () => (next) => (action) => next(action),
}));

const DONGLE = 'aaaaaaaaaaaaaaaa';

it('links settings without nesting device links, and only intercepts regular clicks', () => {
  const history = createMemoryHistory({ initialEntries: [`/${DONGLE}`] });
  const device = { dongle_id: DONGLE, alias: 'Device', is_owner: true };
  const store = createAppStore(history, { ...createInitialState(), dongleId: DONGLE, devices: [device], device, profile: {} });
  render(<Provider store={store}><DeviceList selectedDevice={DONGLE} handleDeviceSelected={vi.fn()} /></Provider>);
  const gear = screen.getByRole('link', { name: 'device settings' });
  expect(gear).toHaveAttribute('href', `/${DONGLE}/settings`);
  expect(gear.parentElement.closest('a')).toBeNull();
  let intercepted;
  document.addEventListener('click', (event) => {
    intercepted = event.defaultPrevented;
    event.preventDefault(); // jsdom cannot follow a link in a new tab
  }, { once: true });
  fireEvent.click(gear, { ctrlKey: true });
  expect(intercepted).toBe(false);
  expect(history.location.pathname).toBe(`/${DONGLE}`);
  fireEvent.click(gear);
  expect(history.location.pathname).toBe(`/${DONGLE}/settings`);
});
