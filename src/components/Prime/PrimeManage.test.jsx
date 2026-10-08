import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { PrimeManage } from './PrimeManage';
import { billing } from '../../api';
import { navigateModal } from '../../actions';

vi.mock('../../api', () => ({ billing: { cancelPrime: vi.fn(), switchPrimePlan: vi.fn() } }));
vi.mock('../../actions', () => ({
  primeNav: vi.fn(), primeGetSubscription: vi.fn(), analyticsEvent: vi.fn(),
  navigateModal: vi.fn((...args) => ({ type: 'NAVIGATE', args })),
}));

const props = {
  classes: {}, dispatch: vi.fn(), dongleId: '0000aaaa0000aaaa',
  device: { alias: 'Demo', device_type: 'tici', eligible_features: { prime_data: true } },
  subscription: { user_id: 'user', plan: 'data' },
};

beforeEach(() => vi.clearAllMocks());

it('a cancellation link opens confirmation without changing the subscription', () => {
  render(<PrimeManage {...props} navigation={{ modal: 'prime-cancel' }} />);
  expect(screen.getByRole('heading', { name: 'Cancel prime subscription' })).toBeInTheDocument();
  expect(billing.cancelPrime).not.toHaveBeenCalled();
  expect(billing.switchPrimePlan).not.toHaveBeenCalled();
});

it.each([
  ['data', 'Lite'], ['nodata', 'Standard'],
])('a plan-switch link derives the target from the %s subscription', (plan, target) => {
  render(<PrimeManage {...props} subscription={{ user_id: 'user', plan }} navigation={{ modal: 'prime-plan' }} />);
  expect(screen.getByRole('button', { name: 'Confirm switch' })).toBeInTheDocument();
  expect(screen.getByText(`Switch to ${target} plan`, { selector: 'h2' })).toBeInTheDocument();
  expect(billing.switchPrimePlan).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(navigateModal).toHaveBeenCalledWith(null);
});

it('waits for subscription data before showing a linked plan confirmation', () => {
  const { rerender } = render(<PrimeManage {...props} subscription={null} navigation={{ modal: 'prime-plan' }} />);
  expect(screen.queryByRole('button', { name: 'Confirm switch' })).not.toBeInTheDocument();
  rerender(<PrimeManage {...props} navigation={{ modal: 'prime-plan' }} />);
  expect(screen.getByText('Switch to Lite plan', { selector: 'h2' })).toBeInTheDocument();
  expect(billing.switchPrimePlan).not.toHaveBeenCalled();
});
