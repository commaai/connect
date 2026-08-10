import { describe, expect, it } from 'vitest';

import { formatDriveRange } from './drive-view-format.js';

/**
 * Local time, so these read the same whatever TZ the suite runs in. A drive that
 * crosses midnight is the case the FIXME this replaced described.
 */
const at = (y, m, d, h, min) => new Date(y, m - 1, d, h, min).getTime();

const IN_2026 = at(2026, 6, 1, 12, 0);

describe('formatDriveRange', () => {
  it('names the weekday the drive started on', () => {
    // 2026-06-05 is a Friday
    const { day } = formatDriveRange(at(2026, 6, 5, 9, 0), at(2026, 6, 5, 9, 30), { now: IN_2026 });
    expect(day).toBe('Friday');
  });

  it('leaves the end as a bare time when the drive stays on one day', () => {
    const { start, end } = formatDriveRange(at(2026, 6, 5, 9, 0), at(2026, 6, 5, 9, 30), { now: IN_2026 });
    expect(start).toBe('Jun 5 @ 09:00');
    expect(end).toBe('09:30');
  });

  it('dates the end when the drive crosses midnight', () => {
    const { day, start, end } = formatDriveRange(
      at(2026, 6, 5, 23, 40),
      at(2026, 6, 6, 0, 15),
      { now: IN_2026 },
    );
    // the whole point: `23:40 - 00:15` read as though the drive ran backwards
    expect(day).toBe('Friday');
    expect(start).toBe('Jun 5 @ 23:40');
    expect(end).toBe('Jun 6 @ 00:15');
  });

  it('dates the end across a month boundary too', () => {
    const { start, end } = formatDriveRange(at(2026, 6, 30, 23, 50), at(2026, 7, 1, 0, 5), { now: IN_2026 });
    expect(start).toBe('Jun 30 @ 23:50');
    expect(end).toBe('Jul 1 @ 00:05');
  });

  it('adds the year only for a drive outside the current one', () => {
    const { start, end } = formatDriveRange(at(2019, 10, 11, 14, 0), at(2019, 10, 11, 14, 20), { now: IN_2026 });
    expect(start).toBe('Oct 11, 2019 @ 14:00');
    expect(end).toBe('14:20');
  });

  it('carries the year onto a dated end as well', () => {
    const { start, end } = formatDriveRange(
      at(2019, 12, 31, 23, 30),
      at(2020, 1, 1, 0, 10),
      { now: IN_2026 },
    );
    expect(start).toBe('Dec 31, 2019 @ 23:30');
    expect(end).toBe('Jan 1, 2020 @ 00:10');
  });

  it('treats the same clock time a day apart as a crossing, not a match', () => {
    // a 24h span lands on the same HH:mm; the day check is what separates them
    const { end } = formatDriveRange(at(2026, 6, 5, 9, 0), at(2026, 6, 6, 9, 0), { now: IN_2026 });
    expect(end).toBe('Jun 6 @ 09:00');
  });
});
