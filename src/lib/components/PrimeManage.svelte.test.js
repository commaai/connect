import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PrimeManage from './PrimeManage.svelte';

const { getStripePortal, getStripeSession, getSubscription, cancelPrime, getSubscribeInfo } = vi.hoisted(() => ({
  getStripePortal: vi.fn(),
  getStripeSession: vi.fn(),
  getSubscription: vi.fn(),
  cancelPrime: vi.fn(),
  getSubscribeInfo: vi.fn(),
}));
vi.mock('$lib/api', () => ({
  billing: { getStripePortal, getStripeSession, getSubscription, cancelPrime, getSubscribeInfo },
  USERADMIN_URL_ROOT: 'https://useradmin.example/',
}));

const DONGLE = 'aaaaaaaaaaaaaaaa';
const device = { dongle_id: DONGLE, alias: 'Bronco Sport', device_type: 'threex', eligible_features: {} };

const subscription = {
  user_id: 'u1',
  plan: 'data',
  amount: 2400,
  subscribed_at: 1750000000,
  next_charge_at: 1780000000,
  is_prime_sim: false,
};

beforeEach(() => {
  getStripePortal.mockResolvedValue({ url: 'https://billing.stripe.example/portal' });
  getStripeSession.mockResolvedValue({ payment_status: 'paid' });
  getSubscription.mockResolvedValue(subscription);
  cancelPrime.mockResolvedValue({ success: true });
  getSubscribeInfo.mockResolvedValue({});
  delete window.location;
  window.location = { href: '', origin: 'http://localhost:3000' };
});

const mount = (props = {}) => render(PrimeManage, {
  dongleId: DONGLE,
  device,
  subscription,
  onback: vi.fn(),
  oncancelled: vi.fn(),
  onplanchanged: vi.fn(),
  onanalytics: vi.fn(),
  ...props,
});

const updatePayment = () => screen.getByRole('button', { name: /Update payment method/i });

describe('PrimeManage', () => {
  it('shows the plan, amount and next payment', () => {
    mount();
    expect(screen.getByText(/with data plan/)).toBeInTheDocument();
    expect(screen.getByText('$24.00')).toBeInTheDocument();
  });

  describe('the billing portal', () => {
    it('hands off to stripe on success', async () => {
      mount();

      await userEvent.click(updatePayment());

      await waitFor(() => expect(window.location).toBe('https://billing.stripe.example/portal'));
    });

    it('says so when the portal cannot be reached, instead of appearing to do nothing', async () => {
      getStripePortal.mockRejectedValue(new Error('network down'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();

      await userEvent.click(updatePayment());

      expect(await screen.findByText('Could not open the billing portal. Please try again.')).toBeInTheDocument();
    });

    it('clears the message on a retry that works', async () => {
      getStripePortal.mockRejectedValue(new Error('network down'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();

      await userEvent.click(updatePayment());
      await screen.findByText('Could not open the billing portal. Please try again.');

      getStripePortal.mockResolvedValue({ url: 'https://billing.stripe.example/second' });
      await userEvent.click(updatePayment());

      await waitFor(() => {
        expect(screen.queryByText('Could not open the billing portal. Please try again.')).not.toBeInTheDocument();
      });
    });
  });

  describe('coming back from checkout', () => {
    it('waits for billing to confirm the payment', async () => {
      getStripeSession.mockReturnValue(new Promise(() => {}));
      mount({ stripeSuccess: 'sess_123', subscription: null });

      expect(await screen.findByText('Waiting for confirmed payment')).toBeInTheDocument();
    });

    it('reports the subscription active once it is confirmed and has landed', async () => {
      mount({ stripeSuccess: 'sess_123' });

      expect(await screen.findByText('comma prime activated')).toBeInTheDocument();
    });

    it('keeps polling through a failed check rather than giving up on the first one', async () => {
      getStripeSession
        .mockRejectedValueOnce(new Error('gateway timeout'))
        .mockResolvedValue({ payment_status: 'paid' });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount({ stripeSuccess: 'sess_123' });

      expect(await screen.findByText('comma prime activated', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(getStripeSession).toHaveBeenCalledTimes(2);
    }, 10000);

    it('stops waiting and says so once the checks keep failing', async () => {
      getStripeSession.mockRejectedValue(new Error('gateway timeout'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount({ stripeSuccess: 'sess_123', subscription: null });

      // five attempts, backing off 2s, 4s, 6s, 8s between them
      const message = await screen.findByText(/Could not confirm your payment/, {}, { timeout: 30000 });

      expect(message).toBeInTheDocument();
      // the payment itself may well have gone through, so it must not read as a failure
      expect(message.textContent).toContain('it will still activate');
      expect(screen.queryByText('Waiting for confirmed payment')).not.toBeInTheDocument();
      expect(getStripeSession).toHaveBeenCalledTimes(5);
    }, 40000);
  });

  describe('cancelling', () => {
    it('asks first', async () => {
      mount();

      await userEvent.click(screen.getByRole('button', { name: /Cancel subscription/i }));

      expect(cancelPrime).not.toHaveBeenCalled();
    });

    it('reports a refusal from billing', async () => {
      cancelPrime.mockResolvedValue({ error: true, description: 'already cancelled' });
      mount();

      await userEvent.click(screen.getByRole('button', { name: /Cancel subscription/i }));
      const dialog = within(screen.getAllByRole('dialog').at(-1));
      await userEvent.click(dialog.getByRole('button', { name: /Cancel subscription/i }));

      expect(await screen.findByText('already cancelled')).toBeInTheDocument();
    });
  });
});
