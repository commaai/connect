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

const fragments = [
  { start: 0, end: 2, gap: false },
  { start: 2, end: 4, gap: true },
  { start: 4, end: 6, gap: false },
  { start: 6, end: 8, gap: false },
];

it('skips declared HLS gaps even when the browser advertises the whole playlist', () => {
  const advertised = ranges([[0, 8]]);
  expect(seekTarget(advertised, 3, { start: 0, end: 8 }, fragments)).toBe(4);
  expect(seekTarget(advertised, 2, { start: 0, end: 8 }, fragments)).toBe(4);
  expect(seekTarget(advertised, 4, { start: 0, end: 8 }, fragments)).toBe(4);
});

it('keeps valid unloaded HLS segments seekable rather than using buffered data', () => {
  expect(seekTarget(ranges([]), 5.125, { start: 0, end: 8 }, fragments)).toBe(5.125);
  expect(seekTarget(ranges([[0, 2]]), 7, { start: 0, end: 8 }, fragments)).toBe(7);
});

it('uses the preceding playable point when the next segment is outside the loop', () => {
  expect(seekTarget(ranges([[0, 8]]), 3, { start: 0, end: 3.5 }, fragments)).toBe(1.999);
  expect(seekTarget(ranges([[0, 8]]), 2, { start: 0, end: 2 }, fragments)).toBe(1.999);
});

it('handles discontinuous fragment intervals whose hole is not separately tagged', () => {
  const discontinuous = [fragments[0], fragments[2], fragments[3]];
  expect(seekTarget(ranges([[0, 8]]), 2, { start: 0, end: 8 }, discontinuous)).toBe(4);
  expect(seekTarget(ranges([[0, 8]]), 3, { start: 0, end: 3.5 }, discontinuous)).toBe(1.999);
  expect(seekTarget(ranges([[0, 8]]), 1.5, { start: 0, end: 1.5 }, discontinuous)).toBe(1.5);
});

it('returns no target for a selected range containing only declared gaps', () => {
  expect(seekTarget(ranges([[0, 8]]), 3, { start: 2, end: 4 }, fragments)).toBeNull();
  expect(seekTarget(ranges([[0, 8]]), 2.5, { start: 2.5, end: 3.5 }, fragments)).toBeNull();
  expect(seekTarget(ranges([[0, 8]]), 0, { start: 0, end: 8 }, [{ start: 0, end: 8, gap: true }])).toBeNull();
});

it('retains nominal timestamp tails and the true endpoint without guessing frame times', () => {
  const shifted = [
    { start: 0, end: 2.021333, minEndPTS: 2 },
    { start: 2.021333, end: 4.021333, gap: true },
    { start: 4.021333, end: 6.021333, minEndPTS: 6 },
    { start: 6.021333, end: 8.021333, minEndPTS: 8 },
  ];
  expect(seekTarget(ranges([[0, 8.021333]]), 2, { start: 2, end: 4 }, shifted)).toBe(2);
  expect(seekTarget(ranges([]), 2, { start: 0, end: 4 }, shifted)).toBe(2);
  expect(seekTarget(ranges([]), 3, { start: 0, end: 8.021333 }, shifted)).toBe(4.021333);
  expect(seekTarget(ranges([]), 8.021333, { start: 0, end: 8.021333 }, shifted)).toBe(8.021333);
});

it('does not turn overlapping timestamps before an unloaded valid fragment into a gap', () => {
  const continuous = [
    { start: 0, end: 2.021333, minEndPTS: 2 },
    { start: 2.021333, end: 4.021333 },
  ];
  expect(seekTarget(ranges([]), 2, { start: 2, end: 2.01 }, continuous)).toBe(2);
});

it('retains zero, fractional targets and the real final media endpoint', () => {
  expect(seekTarget(ranges([[0, 8]]), 0, { start: 0, end: 8 }, fragments)).toBe(0);
  expect(seekTarget(ranges([[0, 8]]), 1.234, { start: 0, end: 8 }, fragments)).toBe(1.234);
  expect(seekTarget(ranges([[0, 8]]), 8, { start: 0, end: 8 }, fragments)).toBe(8);
  const short = [{ start: 0, end: 0.0005 }, { start: 0.0005, end: 1, gap: true }];
  expect(seekTarget(ranges([]), 0.1, { start: 0, end: 1 }, short)).toBe(0);
});

it('preserves native seekable behavior while playlist information is unknown', () => {
  const advertised = ranges([[0, 2], [4, 8]]);
  for (const unknown of [undefined, null, [], [null, { start: NaN, end: 8 }]]) {
    expect(seekTarget(advertised, 3, { start: 0, end: 8 }, unknown)).toBe(4);
  }
});
