import { zoomFromParams } from './drive';

const route = { duration: 600000 };

describe('zoomFromParams', () => {
  it('reads the range back as route-relative milliseconds', () => {
    expect(zoomFromParams({ start: '60', end: '180' }, route))
      .toEqual({ start: 60000, end: 180000, previous: null });
  });

  it('starts a new zoom stack, so back returns to the whole route', () => {
    expect(zoomFromParams({ start: '60', end: '180' }, route).previous).toBe(null);
  });

  it('round-trips the path the timeline writes, to within the second it rounds to', () => {
    // DriveView.updateTimeline: urlForState(..., floor(start/1000), floor(end/1000))
    const [start, end] = [123456, 456789];
    const parsed = zoomFromParams(
      { start: String(Math.floor(start / 1000)), end: String(Math.floor(end / 1000)) },
      route,
    );
    expect(start - parsed.start).toBeLessThan(1000);
    expect(end - parsed.end).toBeLessThan(1000);
  });

  it('clamps a range that runs past the end of the route', () => {
    expect(zoomFromParams({ start: '60', end: '9000' }, route))
      .toEqual({ start: 60000, end: 600000, previous: null });
  });

  it('leaves the range alone when the route has not loaded', () => {
    expect(zoomFromParams({ start: '60', end: '9000' }, null))
      .toEqual({ start: 60000, end: 9000000, previous: null });
  });

  it('falls back to the whole route when the range is empty or inverted', () => {
    expect(zoomFromParams({ start: '180', end: '60' }, route)).toBe(null);
    expect(zoomFromParams({ start: '60', end: '60' }, route)).toBe(null);
  });

  it('falls back to the whole route when the range starts past the end of it', () => {
    expect(zoomFromParams({ start: '9000', end: '9600' }, route)).toBe(null);
  });

  it('falls back to the whole route on a range that is not a number', () => {
    expect(zoomFromParams({ start: 'x', end: '180' }, route)).toBe(null);
  });
});
