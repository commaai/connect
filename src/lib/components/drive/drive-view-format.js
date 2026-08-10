import dayjs from 'dayjs';

/**
 * The date range in DriveView's header. `now` is injectable so this is testable
 * without a renderer, the way drive-list-item-format's does it.
 *
 * The end is a bare `HH:mm` while it falls on the start's calendar day, which is
 * every drive that does not cross midnight. When it does cross, `23:40 - 00:15`
 * reads as though the drive ran backwards, so the end states its date too.
 */
export function formatDriveRange(startMillis, endMillis, { now = Date.now() } = {}) {
  const start = dayjs(startMillis);
  const end = dayjs(endMillis);
  const thisYear = dayjs(now).year();

  const dated = (d) => d.format(`MMM D${thisYear === d.year() ? '' : ', YYYY'} @ HH:mm`);

  return {
    day: start.format('dddd'),
    start: dated(start),
    end: end.isSame(start, 'day') ? end.format('HH:mm') : dated(end),
  };
}
