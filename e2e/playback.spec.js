import { test, expect, LOG } from './demo';
import { createMediaFixture } from './media-fixture';

test.use({ media: true, fault: true });
test.beforeAll(() => createMediaFixture());

test('decoded media advances, pauses, seeks and keeps its element under Map', async ({ page }) => {
  await page.goto(`/demo/${LOG}`);
  const video = page.getByLabel('Drive video');
  await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThan(1);
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0.2);
  await video.evaluate(element => { window.playbackElement = element; element.pause(); });
  const paused = await video.evaluate(element => element.currentTime);
  await page.waitForTimeout(400);
  expect(await video.evaluate(element => element.currentTime)).toBeCloseTo(paused, 1);
  await video.evaluate(element => { element.currentTime = 3; });
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeCloseTo(3, 1);
  await page.getByText('Map', { exact: true }).click();
  expect(await video.evaluate(element => element === window.playbackElement)).toBe(true);
  await page.getByText('Video', { exact: true }).click();
  expect(await video.evaluate(element => element === window.playbackElement)).toBe(true);
  await page.screenshot({ path: 'test-results/decoded-playback.png' });
});

test('missing segment shows Retry and recovers on the same element', async ({ page }) => {
  let missing = true;
  await page.route('**/part-*.ts', route => missing
    ? route.fulfill({ status: 404, body: 'Missing footage' }) : route.fallback());
  await page.goto(`/demo/${LOG}`);
  const video = page.getByLabel('Drive video');
  await video.evaluate(element => { window.playbackElement = element; });
  await expect(page.getByText(/This video segment has not uploaded yet|This video format or source is not supported/)).toBeVisible();
  await page.getByText('Map', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  missing = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThan(1);
  expect(await video.evaluate(element => element === window.playbackElement)).toBe(true);
  await page.screenshot({ path: 'test-results/recovered-map.png' });
});

test('stalled manifest times out and exposes Retry', async ({ page }) => {
  await page.route('**/*.m3u8*', async route => {
    await new Promise(resolve => setTimeout(resolve, 17000));
    await route.fallback().catch(() => {});
  });
  await page.goto(`/demo/${LOG}`);
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Video is taking too long to load. Retry to try again.', { exact: true })).toBeVisible();
});

test('blocked playback leaves Play available on Map', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Activation required', 'NotAllowedError'));
  });
  await page.goto(`/demo/${LOG}`);
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeVisible();
  await page.getByText('Map', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeVisible();
});
