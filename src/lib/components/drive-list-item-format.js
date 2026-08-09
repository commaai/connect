import dayjs from 'dayjs';

import { formatDriveDuration } from '../utils';
import { isMetric, KM_PER_MI } from '../utils/conversions';

/** Below this width the drive entry stacks into two rows and drops the arrow. */
export const SMALL_BREAKPOINT = 580;

export function isSmallLayout(windowWidth) {
  return windowWidth < SMALL_BREAKPOINT;
}

/* eslint-disable key-spacing, no-multi-spaces */
export function gridStyles(small) {
  return small ? {
    date:   'order: 1; max-width: 72%; flex-basis: 72%; margin-bottom: 12px',
    dur:    'order: 2; max-width: 28%; flex-basis: 28%; margin-bottom: 12px',
    origin: 'order: 3; max-width: 50%; flex-basis: 50%',
    dest:   'order: 4; max-width: 50%; flex-basis: 50%',
  } : {
    date:   'order: 1; max-width: 28%; flex-basis: 26%',
    dur:    'order: 2; max-width: 14%; flex-basis: 14%',
    origin: 'order: 3; max-width: 26%; flex-basis: 22%',
    dest:   'order: 4; max-width: 26%; flex-basis: 22%',
    arrow:  'order: 5; max-width: 6%; flex-basis: 6%',
  };
}
/* eslint-enable key-spacing, no-multi-spaces */

/**
 * Every string DriveListItem renders, plus the layout it renders them in.
 * `now` and `metric` are injectable so this is testable without a renderer.
 */
export function formatDrive(drive, windowWidth, { now = Date.now(), metric = isMetric() } = {}) {
  const small = isSmallLayout(windowWidth);
  const dateFormat = small ? 'ddd, MMM D' : 'dddd, MMM D';

  const start = dayjs(drive.start_time_utc_millis);
  const sameYear = dayjs(now).year() === start.year();

  return {
    small,
    startDate: start.format(sameYear ? dateFormat : `${dateFormat}, YYYY`),
    startTime: start.format('HH:mm'),
    endTime: dayjs(drive.end_time_utc_millis).format('HH:mm'),
    duration: formatDriveDuration(drive.duration),
    distance: metric
      ? `${+(drive.distance * KM_PER_MI).toFixed(1)} km`
      : `${+drive.distance.toFixed(1)} mi`,
    grid: gridStyles(small),
  };
}
