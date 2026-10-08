import { mediaBounds, seekTarget } from './position';
const route = { duration: 60000, videoStartOffset: 3000 };
const ranges = values => ({ length: values.length, start: i => values[i][0], end: i => values[i][1] });

it('intersects log ranges with the available video duration', () => {
  expect(mediaBounds(route, { startTime: 0, duration: 60000 }, 55)).toEqual({ start: 0, end: 55 });
  expect(mediaBounds(route, { startTime: 10000, duration: 10000 }, 55)).toEqual({ start: 7, end: 17 });
  expect(mediaBounds({ ...route, videoStartOffset: -3000 }, null, 100)).toEqual({ start: 3, end: 63 });
});

it('retains fractional seconds and bounds targets at zero and end', () => {
  const bounds = { start: 0, end: 60 };
  expect(seekTarget(ranges([]), -1, bounds)).toBe(0);
  expect(seekTarget(ranges([]), 1.001, bounds)).toBe(1.001);
  expect(seekTarget(ranges([]), 999, bounds)).toBe(60);
});

it('selects the next playable interval through gaps without escaping the loop', () => {
  const available = ranges([[0, 5], [10, 20], [30, 40]]);
  expect(seekTarget(available, 7, { start: 0, end: 40 })).toBe(10);
  expect(seekTarget(available, 7, { start: 0, end: 8 })).toBe(5);
  expect(seekTarget(available, 0, { start: 12, end: 35 })).toBe(12);
  expect(seekTarget(available, 35, { start: 0, end: 35 })).toBe(35);
});
