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
let failures;
test.beforeAll(async () => {
  fixture = mkdtempSync(join(tmpdir(), 'connect-video-'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x200:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '20', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p', '-g', '60', '-sc_threshold', '0', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2',
    '-hls_list_size', '0', '-hls_segment_filename', join(fixture, 'segment%d.ts'), join(fixture, 'video.m3u8')]);
  // Serve actual failures rather than mocking fetch: native HLS can use the
  // operating system's network stack, outside Playwright route interception.
  server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    const file = new URL(request.url, 'http://localhost').pathname.slice(1);
    if (!/^(video\.m3u8|segment\d+\.ts)$/.test(file)
      || (file === 'video.m3u8' ? manifestFails?.() : segmentFails?.(file))) {
      failures.push(file);
      response.writeHead(404).end();
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
