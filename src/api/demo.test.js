import { createDemoBackend, DEMO_DONGLE_ID, PUBLIC_ROUTE_DONGLE_ID, PUBLIC_ROUTE_LOG_ID } from './demo';
import { selectBackendType } from './backend';

function makeBackend() {
  const publicRoute = {
    fullname: `${PUBLIC_ROUTE_DONGLE_ID}|${PUBLIC_ROUTE_LOG_ID}`,
    url: `https://data.example.com/${PUBLIC_ROUTE_DONGLE_ID}/${PUBLIC_ROUTE_LOG_ID}`,
    segment_numbers: [0, 1, 2],
    segment_start_times: [1000, 61000, 121000],
    segment_end_times: [61000, 121000, 181000],
  };
  const real = {
    routes: {
      getRoutesSegments: vi.fn(async () => [publicRoute]),
      getRouteFiles: vi.fn(async () => ({ qcameras: [`${publicRoute.url}/0/qcamera.ts`] })),
    },
  };
  return { real, demo: createDemoBackend(real) };
}

describe('demo entry points', () => {
  it.each([
    '/demo', '/demo/00000000--0000000001', '/demo/00000000--0000000001/0/20',
    `/${DEMO_DONGLE_ID}`, `/${DEMO_DONGLE_ID}/00000000--0000000001`,
  ])('selects the demo backend for %s', (pathname) => {
    expect(selectBackendType(pathname)).toBe('demo');
  });

  it.each(['/', '/demo-other', '/demonstration', '/aaaaaaaaaaaaaaaa', '/auth/'])('uses the real backend for %s', (pathname) => {
    expect(selectBackendType(pathname)).toBe('real');
  });

  it('loads a hex-ID deep link before loading the dashboard', async () => {
    const { real, demo } = makeBackend();
    const fullname = `${DEMO_DONGLE_ID}|00000000--0000000001`;
    const drive = await demo.routes.getRoutesSegments(DEMO_DONGLE_ID, undefined, undefined, undefined, fullname);
    const dashboard = await demo.routes.getRoutesSegments(DEMO_DONGLE_ID);

    expect(drive).toHaveLength(1);
    expect(drive[0].fullname).toBe(fullname);
    expect(dashboard.length).toBeGreaterThan(1);
    expect(dashboard.every((route) => /^[0-9a-f]{8}--[0-9a-f]{10}$/.test(route.fullname.split('|')[1]))).toBe(true);
    expect(real.routes.getRoutesSegments).toHaveBeenCalledTimes(1);
    expect(real.routes.getRoutesSegments).toHaveBeenCalledWith(
      PUBLIC_ROUTE_DONGLE_ID, undefined, undefined, undefined, `${PUBLIC_ROUTE_DONGLE_ID}|${PUBLIC_ROUTE_LOG_ID}`,
    );
  });

  it('keeps public file URLs when listing a synthetic route', async () => {
    const { real, demo } = makeBackend();
    const files = await demo.routes.getRouteFiles(`${DEMO_DONGLE_ID}|00000000--0000000001`);
    expect(files.qcameras[0]).toContain(PUBLIC_ROUTE_LOG_ID);
    expect(real.routes.getRouteFiles).toHaveBeenCalledWith(`${PUBLIC_ROUTE_DONGLE_ID}|${PUBLIC_ROUTE_LOG_ID}`);
  });
});
