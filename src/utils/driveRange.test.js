import { OUTSIDE_DRIVE_RANGE_ERROR, resolveDriveRange } from './driveRange';

const route = { duration: 60001 };

it('preserves exact millisecond bounds inside the drive', () => {
  expect(resolveDriveRange({ start: 1001, end: 59999 }, route)).toEqual({ zoom: { start: 1001, end: 59999 }, error: null });
});

it('waits for metadata before bounding a requested range', () => {
  const requested = { start: 1001, end: 99999 };
  expect(resolveDriveRange(requested, null)).toEqual({ zoom: requested, error: null });
  expect(resolveDriveRange(requested, route)).toEqual({ zoom: { start: 1001, end: 60001 }, error: null });
});

it('uses the full duration only when no range was requested', () => {
  expect(resolveDriveRange(null, route)).toEqual({ zoom: { start: 0, end: 60001 }, error: null });
  expect(resolveDriveRange({ start: 60001, end: 90000 }, route)).toEqual({ zoom: null, error: OUTSIDE_DRIVE_RANGE_ERROR });
  expect(resolveDriveRange({ start: 70000, end: 90000 }, route)).toEqual({ zoom: null, error: OUTSIDE_DRIVE_RANGE_ERROR });
});

it('does not create a playback loop for an empty drive', () => {
  expect(resolveDriveRange(null, { duration: 0 })).toEqual({ zoom: null, error: OUTSIDE_DRIVE_RANGE_ERROR });
});
