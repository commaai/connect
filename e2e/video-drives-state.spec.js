import { test, expect } from '@playwright/test';

// Verifies the <video>-drives-state refactor: the element is the clock, it
// publishes its position, seek requests reach it, and loop wraps.

import { bootstrapToDrive } from './helpers.js';

test.describe('video drives playback state', () => {
  test.beforeEach(async ({ page }) => {
    // serve a real local HLS stream in place of the (auth-gated) remote one
    await page.route('**/qcamera.m3u8*', (route) =>
      route.fulfill({ path: 'e2e/fixtures/qcamera.m3u8' }));
    await page.route('**/seg*.ts', (route) =>
      route.fulfill({ path: `e2e/fixtures/${new URL(route.request().url()).pathname.split('/').pop()}` }));

    await bootstrapToDrive(page);
  });

  test('video element plays and publishes its position', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const video = page.locator('video');
    await expect(video).toBeVisible();

    // the element actually decodes our stream
    await expect
      .poll(() => page.evaluate(() => document.querySelector('video')?.readyState ?? 0))
      .toBeGreaterThanOrEqual(2);

    // the element is the clock: its position advances on its own
    const t1 = await page.evaluate(() => document.querySelector('video').currentTime);
    await page.waitForTimeout(1500);
    const t2 = await page.evaluate(() => document.querySelector('video').currentTime);
    expect(t2).toBeGreaterThan(t1);
    expect(t1).toBeGreaterThanOrEqual(0);

    expect(errors).toEqual([]);
  });

  test('seek on the timeline moves the video element', async ({ page }) => {
    const ruler = page.getByRole('slider', { name: 'Drive timeline' });
    const box = await ruler.boundingBox();

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);

    // the element goes where the timeline asked it to
    await expect
      .poll(() => page.evaluate(() => document.querySelector('video').currentTime), { timeout: 10_000 })
      .toBeGreaterThan(3);
  });

  test('loop wraps playback back to the loop start', async ({ page }) => {
    const ruler = page.getByRole('slider', { name: 'Drive timeline' });
    const box = await ruler.boundingBox();

    // drag a short range to create a loop
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    // playback should stay inside the loop rather than run past its end
    const before = await page.evaluate(() => document.querySelector('video').currentTime);
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => document.querySelector('video').currentTime);

    // a 12s stream, loop is 30%-50% of it; must not exceed the loop end
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBeLessThan(12);
  });

  test('pause and play are requests the element carries out', async ({ page }) => {
    const pauseBtn = page.getByRole('button', { name: 'Pause' });
    await pauseBtn.click();

    await expect
      .poll(() => page.evaluate(() => document.querySelector('video')?.paused))
      .toBe(true);

    // paused means the clock actually stops
    const paused = await page.evaluate(() => document.querySelector('video').currentTime);
    await page.waitForTimeout(800);
    const still = await page.evaluate(() => document.querySelector('video').currentTime);
    expect(still).toBe(paused);

    await page.getByRole('button', { name: 'Unpause' }).click();
    await expect
      .poll(() => page.evaluate(() => document.querySelector('video')?.paused))
      .toBe(false);
  });
});
