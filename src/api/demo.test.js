import { createDemoBackend, DEMO_DONGLE_ID } from './demo';

describe('demo route clock fixtures', () => {
  it.each([1, 2])('keeps a %s-segment source finite when mutating one segment', async (count) => {
    const start = Date.UTC(2026, 1, 1, 12);
    const source = {
      segment_start_times: Array.from({ length: count }, (_, i) => start + i * 60000),
      segment_end_times: Array.from({ length: count }, (_, i) => start + (i + 1) * 60000),
    };
    const backend = createDemoBackend({ routes: { getRoutesSegments: async () => [source] } });
    const routes = await backend.routes.getRoutesSegments(DEMO_DONGLE_ID);
    const partial = routes.find(route => route.demo_title === 'Epoch date/time (no clock) (1 segment)');
    expect(partial.segment_start_times).toEqual(count === 1 ? [start] : [start, 60000]);
    expect(partial.segment_end_times).toEqual(count === 1 ? [start + 60000] : [start + 60000, 120000]);
    expect(routes.every(route => [...route.segment_start_times, ...route.segment_end_times].every(Number.isFinite))).toBe(true);
    expect(source.segment_start_times[0]).toBe(start);
    expect(source.segment_start_times).toHaveLength(count);
  });
});
