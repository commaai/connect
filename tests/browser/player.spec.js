import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

let fixture;
let server;
let mediaUrl;
let manifestFails;
let segmentFails;
let segmentDelay;
let failures;
test.beforeAll(async () => {
  fixture = mkdtempSync(join(tmpdir(), 'connect-video-'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x200:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '20', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p', '-g', '60', '-sc_threshold', '0', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2',
    '-hls_list_size', '0', '-hls_segment_filename', join(fixture, 'segment%d.ts'), join(fixture, 'video.m3u8')]);
  // Serve actual failures rather than mocking fetch: native HLS can use the
  // operating system's network stack, outside Playwright route interception.
  server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    const file = new URL(request.url, 'http://localhost').pathname.slice(1);
    await new Promise((resolve) => setTimeout(resolve, segmentDelay?.(file) || 0));
    // A failure callback may return an HTTP status; true means 404.
    const failure = !/^(video\.m3u8|segment\d+\.ts)$/.test(file)
      || (file === 'video.m3u8' ? manifestFails?.() : segmentFails?.(file));
    if (failure) {
      failures.push(file);
      response.writeHead(failure === true ? 404 : failure).end();
      return;
    }
    response.setHeader('Content-Type', file.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl');
    response.end(readFileSync(join(fixture, file)));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  mediaUrl = `http://127.0.0.1:${server.address().port}/video.m3u8`;
});
test.afterAll(async () => {
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

async function openPlayer(page, options = {}) {
  manifestFails = options.manifestFails;
  segmentFails = options.segmentFails;
  segmentDelay = options.segmentDelay;
  failures = [];
  await page.goto(`/tests/browser/player.html?media=${encodeURIComponent(mediaUrl)}`);
}

async function state(page) {
  return JSON.parse(await page.getByTestId('playback-state').textContent());
}
// Redux can satisfy offset and buffering assertions while the video has
// failed, so recovery is judged from the element itself.
async function video(page) {
  return page.locator('video').evaluate((media) => ({ time: media.currentTime * 1000, paused: media.paused }));
}
async function playing(page) {
  // Autoplay may be denied by the engine. Resume through the real controls.
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4, { timeout: 20000 });
  if ((await state(page)).speed === 0) await page.getByRole('button', { name: 'Unpause', exact: true }).click();
  await expect.poll(async () => (await state(page)).offset).toBeGreaterThan(500);
}

test('real controls pause, seek rapidly, discover audio, and keep playback in Map mode', async ({ page }) => {
  await openPlayer(page);
  await playing(page);
  await expect(page.getByRole('button', { name: 'Unmute', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Unmute', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('muted', false);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  // pause() changes the native property before its queued pause event publishes
  // the final frame. Wait for that observation before taking the seek baseline.
  await expect.poll(async () => Math.abs((await state(page)).offset
    - await page.locator('video').evaluate((video) => video.currentTime * 1000))).toBeLessThan(50);
  const paused = (await state(page)).offset;
  await page.getByRole('button', { name: 'Jump forward 10 seconds' }).click();
  await page.getByRole('button', { name: 'Jump back 10 seconds' }).click();
  await expect.poll(async () => Math.abs((await state(page)).offset - paused)).toBeLessThan(150);
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  await page.getByText('Map', { exact: true }).click();
  await page.getByRole('button', { name: 'Unpause', exact: true }).click();
  await expect.poll(async () => (await state(page)).offset).toBeGreaterThan(paused + 500);
  await page.getByText('Video', { exact: true }).click();
  await expect(page.locator('video')).toHaveCount(1);
});

test('the timeline follows decoded frames rather than stepping with timeupdate', async ({ page }) => {
  await openPlayer(page);
  await playing(page);
  // Browsers fire timeupdate every ~250ms; the progress overlay should move
  // with the picture, as the old interpolated clock did.
  const positions = await page.getByRole('slider', { name: 'Drive timeline' }).evaluate((ruler) => new Promise((resolve) => {
    const seen = new Set();
    const end = performance.now() + 1000;
    const sample = () => {
      seen.add(ruler.firstElementChild.style.left);
      if (performance.now() < end) requestAnimationFrame(sample);
      else resolve(seen.size);
    };
    requestAnimationFrame(sample);
  }));
  expect(positions).toBeGreaterThan(12);
});

test('a nonzero clip starts at its boundary and loops using the real decoder', async ({ page }) => {
  await openPlayer(page);
  await playing(page);
  await page.getByRole('button', { name: 'Select 8–12 second clip' }).click();
  await expect.poll(async () => (await state(page)).offset).toBeGreaterThanOrEqual(8000);
  await expect.poll(async () => (await state(page)).offset).toBeGreaterThan(11000);
  await expect.poll(async () => (await state(page)).offset).toBeLessThan(9000);
  await page.getByRole('button', { name: 'Replace source' }).click();
  await expect.poll(async () => (await state(page)).buffering).toBe(false);
  await expect(page.locator('video')).toHaveCount(1);
});

test('changing the section keeps pause and moves only a playhead outside it', async ({ page }) => {
  await openPlayer(page);
  await playing(page);
  // The whole drive has nothing to go back to, so it offers Home instead.
  const home = page.getByRole('button', { name: 'Home' });
  await expect(home).toHaveAttribute('href', '/0000aaaa0000aaaa');
  await expect(page.getByRole('button', { name: 'Go Back' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Select 8–12 second clip' }).click();
  await expect(home).toHaveCount(0);
  await expect.poll(async () => (await video(page)).time).toBeGreaterThanOrEqual(8000);
  await expect(page.locator('.DriveView')).toContainText(/@ \d\d:00:08 - \d\d:00:12/);
  // Back to the whole drive contains the playhead, so nothing should move.
  await page.getByRole('button', { name: 'Go Back' }).click();
  await expect(home).toBeVisible();
  await page.waitForTimeout(500);
  const media = await video(page);
  expect(media.paused).toBe(true);
  expect(media.time).toBeGreaterThanOrEqual(8000);
  expect(media.time).toBeLessThan(8500);
  expect((await state(page)).speed).toBe(0);
});

test('a tiny drag selects at least one whole second and loops without a seek storm', async ({ page }) => {
  await openPlayer(page);
  await playing(page);
  const ruler = await page.getByRole('slider', { name: 'Drive timeline' }).boundingBox();
  const y = ruler.y + ruler.height / 2;
  await page.mouse.move(ruler.x + ruler.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(ruler.x + ruler.width * 0.3 + 6, y, { steps: 3 });
  await page.mouse.up();
  // Sections use the URL's whole-second precision, so reloading restores them.
  await expect(page).toHaveURL(/\/6\/7$/);
  const before = (await state(page)).revision;
  await page.waitForTimeout(2000);
  // A one-second loop restarts about twice in two seconds, not every frame.
  expect((await state(page)).revision - before).toBeLessThanOrEqual(3);
  const media = await video(page);
  expect(media.time).toBeGreaterThanOrEqual(6000);
  expect(media.time).toBeLessThanOrEqual(7100);
});

test('a missing manifest shows a retry action and recovers at the selected position', async ({ page }) => {
  let failed = true;
  await openPlayer(page, { manifestFails: () => failed });
  await expect(page.getByRole('button', { name: 'Retry video' })).toBeVisible({ timeout: 30000 });
  await page.locator('.DriveView').screenshot({ path: test.info().outputPath('retry.png') });
  expect(failures).toContain('video.m3u8');
  await page.getByRole('button', { name: 'Select 8–12 second clip' }).click();
  failed = false;
  await page.getByRole('button', { name: 'Retry video' }).click();
  await expect.poll(async () => (await video(page)).time, { timeout: 20000 }).toBeGreaterThan(8500);
  expect((await video(page)).paused).toBe(false);
  await expect(page.getByRole('button', { name: 'Retry video' })).toHaveCount(0);
  await expect.poll(async () => (await state(page)).buffering).toBe(false);
});

test('an expired stream link offers a page reload rather than a futile retry', async ({ page }) => {
  let status = 403;
  await openPlayer(page, { manifestFails: () => status });
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 30000 });
  // Native HLS does not expose the HTTP status, so it can only offer Retry.
  const hlsjs = await page.evaluate(() => 'Hls' in window);
  const action = page.getByRole('button', { name: hlsjs ? 'Reload page' : 'Retry video' });
  await expect(action).toBeVisible();
  if (hlsjs) await expect(page.getByRole('alert')).toContainText('expired');
  status = 0;
  await action.click();
  await playing(page);
});

test('Map mode explains a video failure and retries it from the map', async ({ page }) => {
  let failed = true;
  await openPlayer(page, { manifestFails: () => failed });
  await page.getByText('Map', { exact: true }).click();
  const retry = page.getByRole('button', { name: 'Retry video' });
  await expect(retry).toBeVisible({ timeout: 30000 });
  await expect(retry).toHaveCount(1);
  // Nothing inside the hidden player may take keyboard focus.
  const invisibleFocusable = await page.locator('button', { hasText: 'Retry video' }).evaluateAll((buttons) => buttons
    .filter((button) => { button.focus(); return document.activeElement === button && !button.checkVisibility({ opacityProperty: true }); }).length);
  expect(invisibleFocusable).toBe(0);
  await page.locator('.DriveView').screenshot({ path: test.info().outputPath('map-retry.png') });
  failed = false;
  await retry.click();
  await expect.poll(async () => (await video(page)).time, { timeout: 20000 }).toBeGreaterThan(500);
  await expect(retry).toHaveCount(0);
  await expect.poll(async () => (await state(page)).offset).toBeGreaterThan(500);
});

test('a missing media fragment cannot advance the map clock and retry restores playback', async ({ page }) => {
  let failed = true;
  await openPlayer(page, { segmentFails: () => failed });
  await expect(page.getByRole('button', { name: 'Retry video' })).toBeVisible({ timeout: 45000 });
  expect(failures.some((file) => file.endsWith('.ts'))).toBe(true);
  expect((await state(page)).offset).toBe(0);
  failed = false;
  await page.getByRole('button', { name: 'Retry video' }).click();
  await playing(page);
  await expect.poll(async () => (await state(page)).buffering).toBe(false);
});

test('a fragment failing after playback has begun stops in place or is skipped, never desynchronized', async ({ page }) => {
  let failed = true;
  // Hold the fragment so playback is under way before its request fails.
  await openPlayer(page, { segmentFails: (file) => failed && file === 'segment6.ts', segmentDelay: (file) => (failed && file === 'segment6.ts' ? 3000 : 0) });
  await playing(page);
  // hls.js plays what it buffered and stops at the gap with Retry; native
  // HLS (AVFoundation) may skip the fragment and keep playing instead.
  const retry = page.getByRole('button', { name: 'Retry video' });
  await expect.poll(async () => await retry.count() > 0 || (await video(page)).time > 14000, { timeout: 30000 }).toBe(true);
  const media = await video(page);
  expect(Math.abs((await state(page)).offset - media.time)).toBeLessThan(250);
  if (await retry.count() === 0) return;
  expect(media.paused).toBe(true);
  expect(media.time).toBeGreaterThan(500);
  expect(media.time).toBeLessThan(12100); // segment6 starts at 12s plus its timestamp offset
  failed = false;
  await retry.click();
  await expect.poll(async () => (await video(page)).time, { timeout: 20000 }).toBeGreaterThan(media.time + 500);
  await expect(retry).toHaveCount(0);
});

test('a burst of timeline clicks lands on the last one', async ({ page }) => {
  await openPlayer(page);
  await playing(page);
  const ruler = await page.getByRole('slider', { name: 'Drive timeline' }).boundingBox();
  for (const fraction of [0.9, 0.2, 0.6, 0.1, 0.8, 0.7]) {
    await page.mouse.click(ruler.x + ruler.width * fraction, ruler.y + ruler.height / 2);
  }
  await expect.poll(async () => (await state(page)).buffering).toBe(false);
  const media = await video(page);
  expect(media.time).toBeGreaterThan(13500);
  expect(media.time).toBeLessThan(15500);
  expect(Math.abs((await state(page)).offset - media.time)).toBeLessThan(100);
  await expect(page.getByRole('button', { name: 'Retry video' })).toHaveCount(0);
});
