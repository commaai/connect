// A placeholder for a device the account doesn't list (shared or public).
// A leaf module: the reducer imports it without pulling in the store.
export const emptyDevice = {
  alias: 'Shared device',
  create_time: 1513041169,
  device_type: 'unknown',
  dongle_id: undefined,
  imei: '000000000000000',
  is_owner: false,
  shared: true,
  serial: '00000000',
};
