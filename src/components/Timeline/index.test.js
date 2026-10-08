import { wholeSeconds } from '.';

describe('wholeSeconds', () => {
  it.each([
    ['widens to whole seconds', 12300, 42420, 60000, { start: 12000, end: 43000 }],
    ['keeps whole seconds as they are', 12000, 42000, 60000, { start: 12000, end: 42000 }],
    ['keeps at least one second', 18000, 18300, 60000, { start: 18000, end: 19000 }],
    ['stops at the last whole second of a drive that ends mid-second', 59200, 60400, 60500, { start: 59000, end: 60000 }],
    ['stops a drag to the end of the drive at its last whole second', 30000, 60500, 60500, { start: 30000, end: 60000 }],
    ['finds no range for a drag after the last whole second', 60100, 60400, 60500, null],
    ['finds no range in a drive shorter than a second', 50, 450, 500, null],
  ])('%s', (_name, start, end, duration, expected) => {
    expect(wholeSeconds(start, end, duration)).toEqual(expected);
  });
});
