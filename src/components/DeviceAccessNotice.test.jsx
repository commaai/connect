import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { createStore } from 'redux';

import DeviceAccessNotice from './DeviceAccessNotice';

const DONGLE = 'aaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbb';
const sharedDevice = { dongle_id: DONGLE, is_owner: false };

function renderNotice(state = {}) {
  const store = createStore(
    (current, action) => action.type === 'TEST_ACCESS_CHANGED'
      ? { ...current, ...action.payload }
      : current,
    { dongleId: DONGLE, device: sharedDevice, profile: { superuser: false }, ...state },
  );
  render(<DeviceAccessNotice store={store} />);
  return store;
}

describe('device access notice', () => {
  it.each([['signed in', { superuser: false }], ['without a profile', null]])(
    'explains confirmed read-only access %s',
    (_name, profile) => {
      renderNotice({ profile });

      expect(screen.getByText('Read-only access')).toBeVisible();
      expect(screen.getByText(/available drives/i)).toBeVisible();
      expect(screen.getByText(/uploaded files/i)).toBeVisible();
      expect(screen.getByText(/owner/i)).toBeVisible();
    },
  );

  it.each([
    ['an owner', { device: { ...sharedDevice, is_owner: true } }],
    ['a superuser', { profile: { superuser: true } }],
    ['a device still loading', { device: null }],
    ['unknown ownership', { device: { dongle_id: DONGLE } }],
    ['no selected device', { dongleId: null, device: { ...sharedDevice, dongle_id: null } }],
    ['permissions from the previously selected device', { dongleId: OTHER }],
  ])('does not label %s as read-only', (_name, state) => {
    renderNotice(state);
    expect(screen.queryByText('Read-only access')).not.toBeInTheDocument();
  });

  it('updates the explanation when ownership is established or changes', () => {
    const store = renderNotice({ device: { dongle_id: DONGLE } });
    expect(screen.queryByText('Read-only access')).not.toBeInTheDocument();

    act(() => store.dispatch({ type: 'TEST_ACCESS_CHANGED', payload: { device: sharedDevice } }));
    expect(screen.getByText('Read-only access')).toBeVisible();

    act(() => store.dispatch({
      type: 'TEST_ACCESS_CHANGED',
      payload: { device: { ...sharedDevice, is_owner: true } },
    }));
    expect(screen.queryByText('Read-only access')).not.toBeInTheDocument();
  });
});
