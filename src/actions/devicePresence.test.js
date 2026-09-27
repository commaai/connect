/* eslint-env jest */
import { athena as Athena } from '../api';
import { fetchDeviceNetworkStatus } from './index';
import * as Types from './types';

const DONGLE_ID = '0123456789abcdef';

function getState(version = '0.8.14') {
  return {
    device: {
      dongle_id: DONGLE_ID,
      openpilot_version: version,
    },
    devices: [],
  };
}

describe('device presence', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not update presence after a successful auxiliary RPC', async () => {
    jest.spyOn(Athena, 'postJsonRpcPayload').mockResolvedValue({ result: true });
    const dispatch = jest.fn();

    await fetchDeviceNetworkStatus(DONGLE_ID)(dispatch, () => getState());

    expect(dispatch).toHaveBeenCalledWith({
      type: Types.ACTION_UPDATE_DEVICE_NETWORK,
      dongleId: DONGLE_ID,
      networkMetered: true,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('does not mark the device offline when an auxiliary RPC times out', async () => {
    jest.spyOn(Athena, 'postJsonRpcPayload').mockRejectedValue(new Error('Timed out'));
    const dispatch = jest.fn();

    await fetchDeviceNetworkStatus(DONGLE_ID)(dispatch, () => getState());

    expect(dispatch).not.toHaveBeenCalled();
  });
});
