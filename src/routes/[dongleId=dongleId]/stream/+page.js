import * as Sentry from '@sentry/browser';

import { athena as Athena, devices as Devices } from '$lib/api';
import { deviceIsOnline } from '$lib/utils';

/**
 * actions/index.js fetchDeviceNotCar. The teleop screen reads
 * `device.rpc.not_car`, a field explorer only ever filled in from DeviceInfo on
 * the dashboard, so arriving from there the answer was already in the store.
 * On a direct navigation nothing has asked yet, so ask athena the same way: an
 * offline device, or a call that fails, keeps whatever the device list said.
 *
 * not_car changes nothing structural — a car renders the same teleop shell. It
 * gates the "turn on comma body ignition" hint, and whether closing the screen
 * tears the connection down instead of leaving it prewarmed.
 */
async function fetchDeviceNotCar(dongleId, device) {
  if (device?.rpc?.not_car !== undefined || !deviceIsOnline(device)) return device;

  try {
    const resp = await Athena.postJsonRpcPayload(dongleId, { id: 0, jsonrpc: '2.0', method: 'getNotCar' });
    if (resp && resp.result !== undefined) {
      return { ...device, rpc: { ...device.rpc, not_car: resp.result === true } };
    }
  } catch (err) {
    if (!err.message || err.message.indexOf('Device not registered') === -1) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'athena_fetch_notcar' });
    }
  }
  return device;
}

export async function load({ params, parent }) {
  const { dongleId } = params;
  const { devices } = await parent();

  // The account's own list already has it; a shared device has to be fetched.
  const device = devices?.find((d) => d.dongle_id === dongleId)
    ?? await Devices.fetchDevice(dongleId).catch((err) => {
      Sentry.captureException(err, { fingerprint: 'teleop_fetch_device' });
      return null;
    });

  // Not awaited: teleop renders from whatever the device list already holds.
  // Gating the first paint on a getNotCar round trip would leave the previous
  // page up for seconds.
  return { dongleId, device, notCar: fetchDeviceNotCar(dongleId, device) };
}
