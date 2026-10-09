import {
  createDemoBackend, DEMO_DONGLE_ID, PUBLIC_ROUTE_DONGLE_ID, PUBLIC_ROUTE_LOG_ID,
} from './demo';

const publicRoute = {
  fullname: `${PUBLIC_ROUTE_DONGLE_ID}|${PUBLIC_ROUTE_LOG_ID}`,
  segment_end_times: [60000, 120000, 180000], segment_numbers: [0, 1, 2],
  segment_start_times: [0, 60000, 120000], share_exp: 4000000000, share_sig: 'signature',
  url: `https://routes.example/${PUBLIC_ROUTE_DONGLE_ID}/${PUBLIC_ROUTE_LOG_ID}`,
};
const playlist = '#EXTM3U\n#EXTINF:60,\nhttps://media.example/0/qcamera.ts\n#EXTINF:60,\nhttps://media.example/1/qcamera.ts\n#EXTINF:60,\nhttps://media.example/2/qcamera.ts\n#EXT-X-ENDLIST';

afterEach(() => vi.unstubAllGlobals());

test('retries the gap playlist and keeps its missing segment in the manifest', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(new Response(playlist));
  vi.stubGlobal('fetch', fetch);
  const backend = createDemoBackend({
    routes: { getRoutesSegments: vi.fn(async () => [publicRoute]), getRouteFiles: vi.fn() },
    video: { getQcameraStreamUrl: vi.fn((route) => `https://api.example/${route}/qcamera.m3u8`) },
  });

  await backend.routes.getRoutesSegments(DEMO_DONGLE_ID);
  const routes = await backend.routes.getRoutesSegments(DEMO_DONGLE_ID);
  const gapRoute = routes.find(({ demo_title: title }) => title === 'Video not recorded (middle segment, qlog present)');
  expect(fetch).toHaveBeenCalledTimes(2);

  const url = backend.video.getQcameraStreamUrl(gapRoute.fullname, gapRoute.share_exp, gapRoute.share_sig);
  const manifest = atob(url.split(',')[1].split('#')[0]);
  const gapLogId = gapRoute.fullname.split('|')[1];

  expect(manifest).toContain('https://media.example/0/qcamera.ts');
  expect(manifest).toContain(`${publicRoute.url.replace(PUBLIC_ROUTE_LOG_ID, gapLogId)}/1/qcamera.ts`);
  expect(manifest).toContain('https://media.example/2/qcamera.ts');
});
