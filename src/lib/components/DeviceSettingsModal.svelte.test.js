import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DeviceSettingsModal from './DeviceSettingsModal.svelte';

const { setDeviceAlias, grantDeviceReadPermission, unpair } = vi.hoisted(() => ({
  setDeviceAlias: vi.fn(),
  grantDeviceReadPermission: vi.fn(),
  unpair: vi.fn(),
}));
vi.mock('$lib/api', () => ({
  devices: { setDeviceAlias, grantDeviceReadPermission, unpair },
  athena: { postJsonRpcPayload: vi.fn() },
}));

const DONGLE = 'aaaaaaaaaaaaaaaa';
const device = { dongle_id: DONGLE, alias: 'Bronco Sport', is_owner: true };

beforeEach(() => {
  setDeviceAlias.mockResolvedValue({ alias: 'Renamed' });
  grantDeviceReadPermission.mockResolvedValue({});
  unpair.mockResolvedValue({ success: true });
});

function mount(props = {}) {
  return render(DeviceSettingsModal, {
    isOpen: true,
    dongleId: DONGLE,
    device,
    profile: { id: 'u1' },
    onclose: vi.fn(),
    onunpaired: vi.fn(),
    onprimenav: vi.fn(),
    ...props,
  });
}

const aliasField = () => screen.getByLabelText('Device name');
const shareField = () => screen.getByLabelText('Share by email or user id');

describe('DeviceSettingsModal', () => {
  it('renders nothing while closed', () => {
    mount({ isOpen: false });
    expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
  });

  it('opens with the device name already in the field', () => {
    mount();
    expect(aliasField()).toHaveValue('Bronco Sport');
  });

  describe('renaming the device', () => {
    it('offers no save button until the name is actually changed', async () => {
      mount();
      expect(screen.queryByRole('button', { name: 'save device name' })).not.toBeInTheDocument();

      await userEvent.type(aliasField(), '!');

      expect(screen.getByRole('button', { name: 'save device name' })).toBeInTheDocument();
    });

    it('trims the name before sending it', async () => {
      mount();

      await userEvent.clear(aliasField());
      await userEvent.type(aliasField(), '  Bronco  ');
      await userEvent.click(screen.getByRole('button', { name: 'save device name' }));

      expect(setDeviceAlias).toHaveBeenCalledWith(DONGLE, 'Bronco');
    });

    it('saves on Enter without reaching for the button', async () => {
      mount();

      await userEvent.clear(aliasField());
      await userEvent.type(aliasField(), 'Bronco{Enter}');

      await waitFor(() => expect(setDeviceAlias).toHaveBeenCalledWith(DONGLE, 'Bronco'));
    });

    it('accepts an empty name', async () => {
      mount();

      await userEvent.clear(aliasField());
      await userEvent.click(screen.getByRole('button', { name: 'save device name' }));

      expect(setDeviceAlias).toHaveBeenCalledWith(DONGLE, '');
    });

    it('reports a rename the API refused', async () => {
      setDeviceAlias.mockRejectedValue(new Error('too long'));
      mount();

      await userEvent.type(aliasField(), '!');
      await userEvent.click(screen.getByRole('button', { name: 'save device name' }));

      expect(await screen.findByText('too long')).toBeInTheDocument();
    });
  });

  describe('sharing the device', () => {
    it('offers no share button for an empty address', () => {
      mount();
      expect(screen.queryByRole('button', { name: 'share device' })).not.toBeInTheDocument();
    });

    it('grants read access and clears the field', async () => {
      mount();

      await userEvent.type(shareField(), ' friend@example.com ');
      await userEvent.click(screen.getByRole('button', { name: 'share device' }));

      await waitFor(() => expect(grantDeviceReadPermission).toHaveBeenCalledWith(DONGLE, 'friend@example.com'));
      await waitFor(() => expect(shareField()).toHaveValue(''));
    });

    it('says so when there is no such user', async () => {
      grantDeviceReadPermission.mockRejectedValue(Object.assign(new Error('nope'), { resp: { status: 404 } }));
      mount();

      await userEvent.type(shareField(), 'nobody@example.com');
      await userEvent.click(screen.getByRole('button', { name: 'share device' }));

      expect(await screen.findByText('could not find user')).toBeInTheDocument();
    });

    it('falls back to a generic message for any other failure', async () => {
      grantDeviceReadPermission.mockRejectedValue(new Error('boom'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();

      await userEvent.type(shareField(), 'friend@example.com');
      await userEvent.click(screen.getByRole('button', { name: 'share device' }));

      expect(await screen.findByText('unable to share')).toBeInTheDocument();
    });
  });

  describe('unpairing', () => {
    /** Both modals are open at once once it is confirming; this is the second. */
    const confirmDialog = () => within(screen.getAllByRole('dialog')[1]);

    const openConfirm = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Unpair' }));
      return confirmDialog();
    };

    it('asks for confirmation first', async () => {
      mount();

      const dialog = await openConfirm();

      expect(dialog.getByText('Unpair device')).toBeInTheDocument();
      expect(dialog.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
      expect(unpair).not.toHaveBeenCalled();
    });

    it('backs out without unpairing', async () => {
      mount();

      const dialog = await openConfirm();
      await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }));

      expect(unpair).not.toHaveBeenCalled();
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });

    it('warns that a prime subscription goes with it', async () => {
      mount({ device: { ...device, prime: true } });

      const dialog = await openConfirm();

      expect(dialog.getByText(/cancel the comma prime subscription/)).toBeInTheDocument();
    });

    it('says nothing about prime for a device without it', async () => {
      mount();

      const dialog = await openConfirm();

      expect(dialog.queryByText(/comma prime/)).not.toBeInTheDocument();
    });

    it('warns about commacare separately, since that one does not come back', async () => {
      mount({ device: { ...device, prime: true, commacare: true } });

      const dialog = await openConfirm();

      expect(dialog.getByText(/permanently end your commacare extended warranty/)).toBeInTheDocument();
    });

    it('tells the parent once the device is gone, and only then', async () => {
      const onunpaired = vi.fn();
      mount({ onunpaired });

      const dialog = await openConfirm();
      await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => expect(unpair).toHaveBeenCalledWith(DONGLE));
      expect(await dialog.findByText('Unpaired')).toBeInTheDocument();
      expect(onunpaired).not.toHaveBeenCalled();

      await userEvent.click(dialog.getByRole('button', { name: 'Close' }));

      expect(onunpaired).toHaveBeenCalled();
    });

    it('reports a refusal from the API rather than claiming success', async () => {
      unpair.mockResolvedValue({ success: false, error: 'device is not yours' });
      mount();

      const dialog = await openConfirm();
      await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }));

      expect(await dialog.findByText('device is not yours')).toBeInTheDocument();
      expect(dialog.queryByText('Unpaired')).not.toBeInTheDocument();
    });

    it('reports a request that never got through', async () => {
      unpair.mockRejectedValue(new Error('offline'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();

      const dialog = await openConfirm();
      await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }));

      expect(await dialog.findByText('Unable to unpair')).toBeInTheDocument();
    });
  });

  it('closes itself on the way to prime settings', async () => {
    const onprimenav = vi.fn();
    const onclose = vi.fn();
    mount({ onprimenav, onclose });

    await userEvent.click(screen.getByRole('button', { name: 'Prime settings' }));

    expect(onprimenav).toHaveBeenCalledWith(DONGLE);
    expect(onclose).toHaveBeenCalled();
  });

  it('resets the form when it is pointed at another device', async () => {
    const { rerender } = mount();
    await userEvent.type(shareField(), 'friend@example.com');

    await rerender({
      isOpen: true,
      dongleId: 'bbbbbbbbbbbbbbbb',
      device: { dongle_id: 'bbbbbbbbbbbbbbbb', alias: 'Body', is_owner: true },
    });

    expect(shareField()).toHaveValue('');
    expect(aliasField()).toHaveValue('Body');
  });
});
