import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PrimeCheckout from './PrimeCheckout.svelte';

const { getStripeCheckout, getSubscribeInfo } = vi.hoisted(() => ({
  getStripeCheckout: vi.fn(),
  getSubscribeInfo: vi.fn(),
}));
vi.mock('$lib/api', () => ({
  billing: { getStripeCheckout, getSubscribeInfo },
  USERADMIN_URL_ROOT: 'https://useradmin.example/',
}));

const DONGLE = 'aaaaaaaaaaaaaaaa';

const device = {
  dongle_id: DONGLE,
  alias: 'Bronco Sport',
  device_type: 'threex',
  eligible_features: { prime_data: true },
};

/** A device with a usable comma SIM, which is what the data plan needs. */
const subscribeInfo = {
  sim_id: 'sim-1',
  is_prime_sim: true,
  sim_usable: true,
  sim_type: 'blue',
  device_online: true,
};

beforeEach(() => {
  getStripeCheckout.mockResolvedValue({ url: 'https://checkout.stripe.example/session' });
  getSubscribeInfo.mockResolvedValue(subscribeInfo);
  // jsdom will not let the test assign window.location, and the success path does
  delete window.location;
  window.location = { href: '', origin: 'http://localhost:3000' };
});

const mount = (props = {}) => render(PrimeCheckout, {
  dongleId: DONGLE,
  device,
  subscribeInfo,
  onactivated: vi.fn(),
  onprimenav: vi.fn(),
  onanalytics: vi.fn(),
  ...props,
});

const checkoutButton = () => screen.getByRole('button', { name: /Go to checkout|Claim trial/ });

describe('PrimeCheckout', () => {
  describe('plan availability', () => {
    it('offers the data plan for an eligible device with a usable comma SIM', () => {
      mount();
      expect(screen.queryByText(/Standard plan is not available/)).not.toBeInTheDocument();
    });

    it('explains a device that is not eligible for it', () => {
      mount({ device: { ...device, eligible_features: { prime_data: false } } });
      expect(screen.getByText('Standard plan is not available for your device.')).toBeInTheDocument();
    });

    it('tells an online device with no SIM to check the tray', () => {
      mount({ subscribeInfo: { ...subscribeInfo, sim_id: null, device_online: true } });
      expect(screen.getByText(/no SIM was detected/)).toBeInTheDocument();
    });

    it('tells an unreachable device to get online first', () => {
      mount({ subscribeInfo: { ...subscribeInfo, sim_id: null, device_online: false } });
      expect(screen.getByText(/device could not be reached/)).toBeInTheDocument();
    });

    it('names a third-party SIM as the reason', () => {
      mount({ subscribeInfo: { ...subscribeInfo, is_prime_sim: false } });
      expect(screen.getByText(/detected a third-party SIM/)).toBeInTheDocument();
    });

    it('points a cancelled blue SIM at the shop', () => {
      mount({ subscribeInfo: { ...subscribeInfo, sim_usable: false, sim_type: 'blue' } });
      expect(screen.getByText(/SIM has been canceled/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'shop' })).toBeInTheDocument();
    });
  });

  describe('going to checkout', () => {
    it('sends the selected plan and the SIM it applies to', async () => {
      mount();

      await userEvent.click(checkoutButton());

      await waitFor(() => expect(getStripeCheckout).toHaveBeenCalledWith(DONGLE, 'sim-1', 'data'));
    });

    it('leaves the SIM out of a plan that does not use one', async () => {
      mount({ device: { ...device, eligible_features: { prime_data: false } } });

      await userEvent.click(checkoutButton());

      await waitFor(() => expect(getStripeCheckout).toHaveBeenCalledWith(DONGLE, undefined, 'nodata'));
    });

    it('hands off to stripe on success', async () => {
      mount();

      await userEvent.click(checkoutButton());

      await waitFor(() => expect(window.location).toBe('https://checkout.stripe.example/session'));
    });

    it('reports a checkout it could not reach', async () => {
      getStripeCheckout.mockRejectedValue(new Error('network down'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();

      await userEvent.click(checkoutButton());

      expect(await screen.findByText('Could not reach checkout. Please try again.')).toBeInTheDocument();
    });

    it('lets you try again instead of spinning for good', async () => {
      getStripeCheckout.mockRejectedValue(new Error('network down'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();

      await userEvent.click(checkoutButton());
      await screen.findByText('Could not reach checkout. Please try again.');

      // the button used to stay disabled behind its spinner, with nothing said
      expect(checkoutButton()).toBeEnabled();

      getStripeCheckout.mockResolvedValue({ url: 'https://checkout.stripe.example/second' });
      await userEvent.click(checkoutButton());

      await waitFor(() => expect(getStripeCheckout).toHaveBeenCalledTimes(2));
      expect(screen.queryByText('Could not reach checkout. Please try again.')).not.toBeInTheDocument();
    });

    it('reports the checkout, once, for analytics', async () => {
      const onanalytics = vi.fn();
      mount({ onanalytics });

      await userEvent.click(checkoutButton());

      await waitFor(() => expect(onanalytics).toHaveBeenCalledWith('prime_checkout', { plan: 'data' }));
    });
  });

  it('says the checkout was cancelled when stripe sends you back', () => {
    mount({ stripeCancelled: '1' });
    expect(screen.getByText('Checkout cancelled')).toBeInTheDocument();
  });

  it('sends an already-subscribed device straight to management', () => {
    const onactivated = vi.fn();
    mount({ device: { ...device, prime: true }, onactivated });
    expect(onactivated).toHaveBeenCalled();
  });

  it('offers the trial wording when there is a trial to claim', () => {
    mount({ subscribeInfo: { ...subscribeInfo, trial_end_data: 1780000000 } });
    expect(screen.getByRole('button', { name: 'Claim trial' })).toBeInTheDocument();
    expect(screen.getByText(/Your first charge will be on/)).toBeInTheDocument();
  });
});
