import { deviceVersionAtLeast, formatDriveDuration, getDeviceFromState } from '.';

test('looks up devices before the selected device or collection has loaded', () => {
  const device = { dongle_id: '1234567890abcdef' };
  expect(getDeviceFromState({}, device.dongle_id)).toBeNull();
  expect(getDeviceFromState({ device: null, devices: null }, device.dongle_id)).toBeNull();
  expect(getDeviceFromState({ device }, device.dongle_id)).toBe(device);
  expect(getDeviceFromState({ devices: [device] }, device.dongle_id)).toBe(device);
});

test('prefers the selected device and can still find another known device', () => {
  const device = { dongle_id: '1234567890abcdef', alias: 'Current' };
  const other = { dongle_id: 'abcdef1234567890' };
  const state = { device, devices: [{ ...device, alias: 'Cached' }, other] };
  expect(getDeviceFromState(state, device.dongle_id)).toBe(device);
  expect(getDeviceFromState(state, other.dongle_id)).toBe(other);
  expect(getDeviceFromState(state, '0000000000000000')).toBeNull();
});

test('formats durations correctly', () => {
  // 1 hour, 59 minutes, 59 seconds
  const one = 1 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000;
  const oneFormatted = formatDriveDuration(one);
  expect(oneFormatted).toEqual('1 hr 59 min');

  // 59 minutes, 59 seconds
  const two = 59 * 60 * 1000 + 59 * 1000;
  const twoFormatted = formatDriveDuration(two);
  expect(twoFormatted).toEqual('59 min');

  // 60 seconds
  const three = 60 * 1000;
  const threeFormatted = formatDriveDuration(three);
  expect(threeFormatted).toEqual('1 min');

  // 59 seconds
  const four = 59 * 1000;
  const fourFormatted = formatDriveDuration(four);
  expect(fourFormatted).toEqual('0 min');
});

test('compares versions correctly', () => {
  const device = (version) => ({ openpilot_version: version });
  expect(deviceVersionAtLeast(device('0.8.0'), '0.0.1')).toEqual(true);
  expect(deviceVersionAtLeast(device('0.8.0'), '0.7.0')).toEqual(true);
  expect(deviceVersionAtLeast(device('0.8.0'), '0.7.99')).toEqual(true);
  expect(deviceVersionAtLeast(device('0.8.0.1'), '0.8.0')).toEqual(true);
  expect(deviceVersionAtLeast(device('0.8.0.1'), '0.8.0.1')).toEqual(true);

  expect(deviceVersionAtLeast(device('0.8.0'), '0.8.1')).toEqual(false);
  expect(deviceVersionAtLeast(device('0.8.0'), '0.9.0')).toEqual(false);
  expect(deviceVersionAtLeast(device('0.8.0'), '1.0.0')).toEqual(false);
  expect(deviceVersionAtLeast(device('0.7.99'), '0.8.0')).toEqual(false);
  expect(deviceVersionAtLeast(device('1.0.0'), '2.0.0')).toEqual(false);

  expect(deviceVersionAtLeast(device('0.8.14'), '0.8.14')).toEqual(true);
  expect(deviceVersionAtLeast(device('0.8.14'), '0.8.13')).toEqual(true);
  expect(deviceVersionAtLeast(device('0.8.13'), '0.8.14')).toEqual(false);
  expect(deviceVersionAtLeast(device('0.8.13'), '0.8.13')).toEqual(true);
});
