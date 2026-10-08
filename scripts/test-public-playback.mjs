// Optional live regression: public /demo data and video are fetched from comma.
// Map styling and analytics are isolated; the actual player, GPS, and media run.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer as createPortProbe } from 'node:net';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = process.argv.slice(2).find((argument) => argument !== '--mse') || process.env.PLAYWRIGHT_MODULE;
const moduleFile = modulePath && (modulePath.endsWith('.mjs') || modulePath.endsWith('.js') ? resolve(modulePath) : resolve(modulePath, 'index.mjs'));
const { chromium } = modulePath ? await import(pathToFileURL(moduleFile).href) : await import('playwright');
const forceMse = process.argv.includes('--mse');
const port = await new Promise((resolvePort, reject) => {
  const probe = createPortProbe();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolvePort(port)); });
});
const server = await createServer({
  root, cacheDir: resolve(root, 'test-results/vite-public-cache'),
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null },
  plugins: [{ name: 'public-route-map-receipt', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/components/DriveMap/index.jsx')) {
      return code.replace('const map = mapComponent.getMap();', 'const map = mapComponent.getMap(); window.__publicMap = map;');
    }
    return undefined;
  } }],
});
let browser;
const receipts = [];
const network = [];
const startedAt = new Date().toISOString();

async function readState(page) {
  return page.evaluate(async () => {
    const [{ default: store }, { currentOffset }] = await Promise.all([import('/src/store.js'), import('/src/timeline/index.js')]);
    const video = document.querySelector('video');
    const route = store.getState().currentRoute;
    return { route: route?.fullname, routeDuration: route?.duration, videoStartOffset: route?.videoStartOffset,
      mediaTime: video?.currentTime, mediaDuration: video?.duration, paused: video?.paused,
      buffering: store.getState().isBufferingVideo, offset: currentOffset(),
      nativeAdvertised: Boolean(video?.canPlayType('application/vnd.apple.mpegurl')),
      transport: video?.currentSrc.startsWith('blob:') ? 'mse' : 'native',
      decodedFrames: video?.getVideoPlaybackQuality().totalVideoFrames,
      alert: document.querySelector('[role="alert"]')?.textContent,
      mediaError: video?.error && { code: video.error.code, message: video.error.message },
      readyState: video?.readyState, coordinates: Object.keys(route?.driveCoords || {}).length };
  });
}

async function openPage(origin) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'UTC' });
  const address = (url) => { const parsed = new URL(url); return parsed.hostname + parsed.pathname; };
  context.on('requestfailed', (request) => network.push({ path: address(request.url()), failure: request.failure()?.errorText }));
  context.on('response', (response) => {
    if (response.status() >= 400 || /\.(m3u8|ts)(\?|$)/.test(response.url())) {
      network.push({ path: address(response.url()), status: response.status() });
    }
  });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'api.mapbox.com') return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(url.pathname.startsWith('/styles/') ? { version: 8, sources: {}, layers: [] } : { features: [] }) });
    if (url.origin === origin || ['.comma.ai', '.commadotai.com', '.azureedge.net', '.blob.core.windows.net'].some((suffix) => url.hostname.endsWith(suffix))) return route.continue();
    return route.abort();
  });
  if (forceMse) await context.addInitScript(() => {
    const nativeType = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function forcedMse(type) {
      return type === 'application/vnd.apple.mpegurl' ? '' : nativeType.call(this, type);
    };
  });
  return { context, page: await context.newPage() };
}

function assertClock(sample) {
  assert(Math.abs(sample.offset - (sample.mediaTime * 1000 + (sample.videoStartOffset || 0))) < 20, 'Public media position must drive the route clock');
  assert(!sample.alert, `Public video error: ${sample.alert}`);
  assert(sample.decodedFrames > 0, 'Public route must decode real frames');
}

try {
  await server.listen();
  const origin = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  {
    const { context, page } = await openPage(origin);
    try {
      const started = performance.now();
      await page.goto(`${origin}/demo?ci=1`);
      await page.getByText('Playback baseline', { exact: true }).click();
      await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.5 || document.querySelector('[role="alert"]'), null, { timeout: 30000 });
      assert(!(await page.getByRole('alert').count()), 'Public player entered terminal error');
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      const initial = await readState(page);
      assertClock(initial);
      assert(initial.routeDuration > 900000, 'This regression needs a real long route');
      receipts.push({ case: 'public long route decode', elapsedMs: Math.round(performance.now() - started), ...initial });
      for (const target of [59, 61, 800]) {
        const before = await readState(page);
        const started = performance.now();
        const ruler = page.getByRole('slider', { name: 'Drive timeline' });
        const box = await ruler.boundingBox();
        await ruler.click({ position: { x: box.width * target * 1000 / before.routeDuration, y: 20 } });
        await page.waitForFunction(({ target, videoOrigin }) => {
          const video = document.querySelector('video');
          return video?.readyState >= 2 && !video.seeking && Math.abs(video.currentTime - (target - videoOrigin / 1000)) < 0.5;
        }, { target, videoOrigin: before.videoStartOffset || 0 }, { timeout: 30000 });
        const sample = await readState(page);
        assertClock(sample);
        receipts.push({ case: `public seek ${target}s`, elapsedMs: Math.round(performance.now() - started), ...sample });
      }
      await page.screenshot({ path: resolve(root, 'test-results/public-route-preview.png') });
    } catch (error) {
      receipts.push({ failedState: await readState(page) });
      await page.screenshot({ path: resolve(root, 'test-results/public-route-failure.png') });
      throw error;
    } finally { await context.close(); }
  }
  {
    const { context, page } = await openPage(origin);
    try {
      await page.goto(`${origin}/deadbeefdeadbeef/00000000--0000000011/300/320?ci=1`);
      await page.waitForFunction(() => {
        const video = document.querySelector('video');
        return video?.readyState >= 2 && !video.seeking && video.currentTime > 295 && video.currentTime < 305;
      }, null, { timeout: 30000 });
      const sample = await readState(page);
      assertClock(sample);
      assert(sample.offset >= 300000 && sample.offset < 305000);
      receipts.push({ case: 'public cold300/320 range', ...sample });
    } finally { await context.close(); }
  }
} catch (error) {
  receipts.push({ failure: error.message.replaceAll(root, '<project>') });
  process.exitCode = 1;
} finally {
  try {
    await mkdir(resolve(root, 'test-results'), { recursive: true });
    const destination = resolve(root, `test-results/public-route-${forceMse ? 'mse' : 'default'}-report.json`);
    await writeFile(destination, `${JSON.stringify({ startedAt, browser: browser?.version(), forceMse, receipts, network }, null, 2)}\n`);
    console.log(JSON.stringify(receipts, null, 2));
    console.log(`Public route receipt: ${destination}`);
  } finally {
    try { await browser?.close(); }
    finally { await server.close(); }
  }
}
