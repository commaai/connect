/* eslint-env jest */
import { findMonoTime } from './logIndex';

// export function findMonoTime (index, monoTime, start, end) {

it('can binary search correctly', () => {
  const exampleIndex = {
    index: [
      [123],
      [234],
      [456],
      [567],
      [567],
      [678]
    ]
  };
  expect(findMonoTime(exampleIndex, 123)).toBe(0);
  expect(findMonoTime(exampleIndex, 0)).toBe(0);
  expect(findMonoTime(exampleIndex, 124)).toBe(1);

  expect(findMonoTime(exampleIndex, 678)).toBe(5);
  expect(findMonoTime(exampleIndex, 679)).toBe(5);
});
