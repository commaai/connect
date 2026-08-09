/* eslint-env jest */
/**
 * The React test rendered DriveListItem and asserted it had the DriveEntry
 * class. There is no renderer here, so it covers the formatting and layout
 * logic the component reads instead.
 */
import { SMALL_BREAKPOINT, formatDrive, gridStyles, isSmallLayout } from './drive-list-item-format';

const drive = {
  fullname: '1d3dc3e03047b0c7/000000dd--455f14369d',
  dongle_id: '1d3dc3e03047b0c7',
  log_id: '000000dd--455f14369d',
  start_time_utc_millis: 1570830798378, // 2019-10-11, in whichever zone the test runs
  end_time_utc_millis: 1570830798378 + 1234,
  distance: 12.5212,
  duration: 1234,
};

const IN_2026 = Date.UTC(2026, 5, 1);

describe('drive list item layout', () => {
  it('switches layout at 580px', () => {
    expect(isSmallLayout(SMALL_BREAKPOINT - 1)).toBe(true);
    expect(isSmallLayout(SMALL_BREAKPOINT)).toBe(false);
  });

  it('stacks into two rows and drops the arrow when small', () => {
    const grid = gridStyles(true);
    expect(Object.keys(grid)).toEqual(['date', 'dur', 'origin', 'dest']);
    expect(grid.date).toContain('flex-basis: 72%');
    expect(grid.dur).toContain('margin-bottom: 12px');
    expect(grid.origin).toContain('flex-basis: 50%');
  });

  it('lays out five columns when wide', () => {
    const grid = gridStyles(false);
    expect(Object.keys(grid)).toEqual(['date', 'dur', 'origin', 'dest', 'arrow']);
    expect(grid.arrow).toBe('order: 5; max-width: 6%; flex-basis: 6%');
    expect(grid.date).not.toContain('margin-bottom');
  });
});

describe('drive list item formatting', () => {
  it('abbreviates the weekday when small', () => {
    expect(formatDrive(drive, 375, { now: IN_2026 }).startDate).toMatch(/^\w{3}, Oct \d{1,2}, 2019$/);
    expect(formatDrive(drive, 1280, { now: IN_2026 }).startDate).toMatch(/^\w+day, Oct \d{1,2}, 2019$/);
  });

  it('only shows the year for drives from another year', () => {
    const { startDate } = formatDrive(drive, 1280, { now: drive.start_time_utc_millis });
    expect(startDate).not.toContain('2019');
    expect(startDate).toMatch(/^\w+day, Oct \d{1,2}$/);
  });

  it('formats start and end times as 24h', () => {
    const { startTime, endTime } = formatDrive(drive, 1280, { now: IN_2026 });
    expect(startTime).toMatch(/^\d{2}:\d{2}$/);
    // 1234ms apart, so the minute cannot differ
    expect(endTime).toEqual(startTime);
  });

  it('formats duration and distance in both unit systems', () => {
    expect(formatDrive(drive, 1280, { now: IN_2026 }).duration).toBe('0 min');
    expect(formatDrive(drive, 1280, { now: IN_2026, metric: false }).distance).toBe('12.5 mi');
    expect(formatDrive(drive, 1280, { now: IN_2026, metric: true }).distance).toBe('20.2 km');
  });

  it('carries the layout choice through to the grid', () => {
    expect(formatDrive(drive, 375, { now: IN_2026 }).small).toBe(true);
    expect(formatDrive(drive, 375, { now: IN_2026 }).grid.arrow).toBeUndefined();
    expect(formatDrive(drive, 1280, { now: IN_2026 }).grid.arrow).toBeTruthy();
  });
});
