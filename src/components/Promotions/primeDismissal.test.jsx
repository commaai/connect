import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Promotions } from '.';
import { AppHeader } from '../AppHeader';
import { dismissPrimePromotion } from './primeDismissal';

const mocks = vi.hoisted(() => ({ primeNav: vi.fn(() => ({ type: 'OPEN_PRIME' })) }));
vi.mock('../../actions', () => ({ primeNav: mocks.primeNav, selectDevice: vi.fn() }));
vi.mock('@commaai/my-comma-auth', () => ({ default: { isAuthenticated: () => false } }));

const first = { dongle_id: '0000aaaa0000aaaa', is_owner: true, prime: false };
const second = { ...first, dongle_id: '1111bbbb1111bbbb' };
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('referrals-09-02-2026', 'true');
  vi.clearAllMocks();
});

function view(device = first, extra = {}) {
  return <><Promotions device={device} dispatch={vi.fn()} />
    <AppHeader classes={{}} dispatch={extra.dispatch || vi.fn()} dongleId={device.dongle_id}
      pathname={`/${device.dongle_id}`} device={device} {...extra} /></>;
}

test('dismissal survives remount and moves Prime access to the header', () => {
  const dispatch = vi.fn();
  const mounted = render(view(first, { dispatch }));
  expect(screen.getByText('comma prime')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Sign up for comma prime' })).toBeNull();
  fireEvent.click(screen.getByLabelText('Dismiss prime promotion'));
  expect(screen.queryByText('comma prime')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sign up for comma prime' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'OPEN_PRIME' });
  mounted.unmount();
  render(view());
  expect(screen.queryByText('comma prime')).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign up for comma prime' })).toBeVisible();
});

test('dismissal is scoped to the device and follows device switches', () => {
  const mounted = render(view());
  act(() => dismissPrimePromotion(first.dongle_id));
  mounted.rerender(view(second));
  expect(screen.getByText('comma prime')).toBeVisible();
  mounted.rerender(view(first));
  expect(screen.queryByText('comma prime')).toBeNull();
});

test.each([{ ...first, is_owner: false }, { ...first, prime: true }])('no promotion for shared or subscribed devices', device => {
  act(() => dismissPrimePromotion(first.dongle_id));
  render(view(device));
  expect(screen.queryByText('comma prime')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sign up for comma prime' })).toBeNull();
});

test('storage changes from another tab update both surfaces', () => {
  render(view());
  localStorage.setItem(`prime-promotion-dismissed:${first.dongle_id}`, 'true');
  act(() => window.dispatchEvent(new Event('storage')));
  expect(screen.queryByText('comma prime')).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign up for comma prime' })).toBeVisible();
});
