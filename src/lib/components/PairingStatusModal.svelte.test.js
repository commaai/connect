import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PairingStatusModal from './PairingStatusModal.svelte';

const { getItem, removeItem } = vi.hoisted(() => ({
  getItem: vi.fn(),
  removeItem: vi.fn(() => Promise.resolve()),
}));
vi.mock('localforage', () => ({ default: { getItem, removeItem } }));

const { pilotPair } = vi.hoisted(() => ({ pilotPair: vi.fn() }));
vi.mock('$lib/api', () => ({ devices: { pilotPair } }));

const { verifyPairToken } = vi.hoisted(() => ({ verifyPairToken: vi.fn() }));
vi.mock('$lib/utils', async (importOriginal) => ({
  ...(await importOriginal()),
  verifyPairToken,
}));

const DONGLE = 'aaaaaaaaaaaaaaaa';

beforeEach(() => {
  getItem.mockResolvedValue(null);
  verifyPairToken.mockReturnValue(true);
  pilotPair.mockResolvedValue({ dongle_id: DONGLE });
});

const dialog = () => screen.queryByRole('dialog');

describe('PairingStatusModal', () => {
  it('stays out of the way when there is no pending pair token', async () => {
    render(PairingStatusModal, { onpaired: vi.fn() });
    await waitFor(() => expect(getItem).toHaveBeenCalledWith('pairToken'));
    expect(dialog()).not.toBeInTheDocument();
  });

  it('opens with a spinner while the token is being redeemed', async () => {
    getItem.mockResolvedValue('a.token');
    pilotPair.mockReturnValue(new Promise(() => {}));
    render(PairingStatusModal, { onpaired: vi.fn() });

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Pairing device')).toBeInTheDocument();
  });

  it('names the device it paired', async () => {
    getItem.mockResolvedValue('a.token');
    render(PairingStatusModal, { onpaired: vi.fn() });

    expect(await screen.findByText(DONGLE)).toBeInTheDocument();
    expect(screen.getByText(/Successfully paired device/)).toBeInTheDocument();
  });

  it('drops the token whether the pairing worked or not', async () => {
    getItem.mockResolvedValue('a.token');
    render(PairingStatusModal, { onpaired: vi.fn() });

    await screen.findByText(DONGLE);
    expect(removeItem).toHaveBeenCalledWith('pairToken');
  });

  it('tells the parent which device was paired, once the modal is dismissed', async () => {
    const onpaired = vi.fn();
    getItem.mockResolvedValue('a.token');
    render(PairingStatusModal, { onpaired });

    await screen.findByText(DONGLE);
    expect(onpaired).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onpaired).toHaveBeenCalledWith(DONGLE);
    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
  });

  describe('when it goes wrong', () => {
    it('reports a token that would not verify, and does not try to pair it', async () => {
      getItem.mockResolvedValue('a.token');
      verifyPairToken.mockImplementation(() => { throw new Error('bad token'); });
      render(PairingStatusModal, { onpaired: vi.fn() });

      expect(await screen.findByText('Error: bad token')).toBeInTheDocument();
      expect(pilotPair).not.toHaveBeenCalled();
    });

    it('reports a response that came back without a dongle', async () => {
      getItem.mockResolvedValue('a.token');
      pilotPair.mockResolvedValue({});
      render(PairingStatusModal, { onpaired: vi.fn() });

      expect(await screen.findByText('Error: could not pair, please try again')).toBeInTheDocument();
    });

    it('translates the API status into something a person can act on', async () => {
      getItem.mockResolvedValue('a.token');
      pilotPair.mockRejectedValue(new Error('403: forbidden'));
      render(PairingStatusModal, { onpaired: vi.fn() });

      expect(await screen.findByText(/device paired with different owner/)).toBeInTheDocument();
    });

    it('does not report a pairing that never happened when dismissed', async () => {
      const onpaired = vi.fn();
      getItem.mockResolvedValue('a.token');
      pilotPair.mockResolvedValue({});
      render(PairingStatusModal, { onpaired });

      await screen.findByText(/could not pair/);
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(onpaired).not.toHaveBeenCalled();
    });

    it('stays shut when localforage itself is unavailable', async () => {
      getItem.mockRejectedValue(new Error('no indexeddb'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      render(PairingStatusModal, { onpaired: vi.fn() });

      await waitFor(() => expect(getItem).toHaveBeenCalled());
      expect(dialog()).not.toBeInTheDocument();
    });
  });

  it('closes on Escape', async () => {
    getItem.mockResolvedValue('a.token');
    render(PairingStatusModal, { onpaired: vi.fn() });

    await screen.findByText(DONGLE);
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
  });
});
