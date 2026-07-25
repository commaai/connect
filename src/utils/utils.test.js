/* eslint-env jest */
import { deviceVersionAtLeast, formatDriveDuration, formatOffset } from '.';

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

test('formats offsets correctly', () => {
  // 1 hour, 23 minutes, 45 seconds
  expect(formatOffset(1 * 60 * 60 * 1000 + 23 * 60 * 1000 + 45 * 1000)).toEqual('1:23:45');

  // 5 minutes, 9 seconds (hours omitted when zero)
  expect(formatOffset(5 * 60 * 1000 + 9 * 1000)).toEqual('05:09');

  // 3 seconds (drops sub-second milliseconds)
  expect(formatOffset(3 * 1000 + 500)).toEqual('00:03');

  // zero
  expect(formatOffset(0)).toEqual('00:00');
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
