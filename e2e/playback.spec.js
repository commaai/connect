import { test, expect, LOG } from './demo';
import { createMediaFixture } from './media-fixture';

test.use({ media: true, fault: true });
test.beforeAll(() => createMediaFixture());

test.beforeEach(async ({ page }, info) => {
  info.mediaFailures = [];
  page.on('requestfailed', request => info.mediaFailures.push({ url: request.url(), failure: request.failure() }));
  page.on('console', message => {
    if (message.type() === 'error') info.mediaFailures.push({ text: message.text(), location: message.location() });
  });
  await page.addInitScript(() => {
    window.mediaEvents = [];
    for (const name of ['loadedmetadata', 'canplay', 'playing', 'pause', 'seeking', 'seeked', 'waiting', 'error', 'ended']) {
      document.addEventListener(name, event => {
        const video = event.target;
        if (!(video instanceof HTMLMediaElement)) return;
        window.mediaEvents.push({ name, time: video.currentTime, paused: video.paused,
          readyState: video.readyState, seeking: video.seeking, error: video.error?.code });
        if (window.mediaEvents.length > 80) window.mediaEvents.shift();
      }, true);
    }
  });
});

test.afterEach(async ({ page, browser }, info) => {
  if (info.status === info.expectedStatus) return;
  if (info.mediaFailures.length) {
    console.log('Playback resource diagnostics:', JSON.stringify(info.mediaFailures));
    await info.attach('media-resource-failures', { body: JSON.stringify(info.mediaFailures, null, 2), contentType: 'application/json' });
  }
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const state = await page.evaluate(() => {
    const video = document.querySelector('video[aria-label="Drive video"]') || document.createElement('video');
    const ranges = list => Array.from({ length: list.length }, (_, i) => [list.start(i), list.end(i)]);
    const speed = document.querySelector('[aria-label="Increase play speed by 1 step"]');
    const bounds = element => element?.getBoundingClientRect().toJSON();
    return { layout: { viewport: { width: innerWidth, height: innerHeight },
      video: bounds(video), speed: bounds(speed) }, codecs: { h264: video.canPlayType('video/mp4; codecs="avc1.42E01E"'),
      aac: video.canPlayType('audio/mp4; codecs="mp4a.40.2"'), hls: video.canPlayType('application/vnd.apple.mpegurl') },
      media: { time: video.currentTime, paused: video.paused, readyState: video.readyState,
        seeking: video.seeking, duration: video.duration, muted: video.muted,
        buffered: ranges(video.buffered), seekable: ranges(video.seekable),
        rate: video.playbackRate, error: video.error?.code, source: video.currentSrc },
      events: window.mediaEvents };
  }).catch(error => ({ diagnosticError: error.message }));
  const diagnostics = { browser: browser.version(), ...state };
  console.log('Playback diagnostics:', JSON.stringify(diagnostics));
  await info.attach('media-diagnostics', { body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json' });
});

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
  await expect.poll(() => video.evaluate(element => element.seeking)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.mediaEvents.some(event => event.name === 'seeked' && Math.abs(event.time - 3) < 0.1))).toBe(true);
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

test('timeline gesture, speed, range reload and drive switch use real media', async ({ page }) => {
  await page.goto(`/demo/${LOG}`);
  const video = page.getByLabel('Drive video');
  await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Increase play speed by 1 step' }).click();
  await expect.poll(() => video.evaluate(element => element.playbackRate)).toBeGreaterThan(1);
  await page.getByRole('slider', { name: 'Drive timeline' }).scrollIntoViewIfNeeded();
  await video.evaluate(element => element.pause());
  const timeline = await page.getByRole('slider', { name: 'Drive timeline' }).boundingBox();
  await page.mouse.move(timeline.x + timeline.width * 0.4, timeline.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(timeline.x + timeline.width * 0.7, timeline.y + 10, { steps: 4 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await expect(page).toHaveURL(new RegExp(`/demo/${LOG}/\\d+/\\d+`));
  const rangeUrl = page.url();
  const start = Number(new URL(rangeUrl).pathname.split('/').at(-2));
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThanOrEqual(start);
  expect(await video.evaluate(element => element.currentTime)).toBeLessThan(start + 1.75);
  const precise = await page.evaluate(() => history.state?.state?.connectZoom || history.state?.connectZoom);
  expect(Number.isFinite(precise?.start)).toBe(true);
  const restoredStart = precise.start / 1000;
  // Measure native restoration, not playback elapsed during runner roundtrips.
  await page.addInitScript(({ start }) => {
    document.addEventListener('loadedmetadata', event => {
      if (event.target instanceof HTMLVideoElement) document.querySelector('button[aria-label="Pause"]')?.click();
    }, true);
    document.addEventListener('seeked', event => {
      const element = event.target;
      if (!(element instanceof HTMLVideoElement) || element.getAttribute('aria-label') !== 'Drive video'
        || window.rangeRestored || element.currentTime < start - 0.1) return;
      window.rangeRestored = { time: element.currentTime, seeking: element.seeking };
      element.pause();
    }, true);
  }, { start: restoredStart });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.rangeRestored)).toBeTruthy();
  const restored = await page.evaluate(() => window.rangeRestored);
  expect(restored.time).toBeCloseTo(restoredStart, 1);
  expect(restored.seeking).toBe(false);
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
  const pausedTime = await video.evaluate(element => element.currentTime);
  await page.waitForTimeout(400);
  expect(await video.evaluate(element => element.currentTime)).toBeCloseTo(pausedTime, 1);
  expect(page.url()).toBe(rangeUrl);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByText('Missing start/end GPS (1 segment)', { exact: true }).click();
  await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThan(1);
  await expect(page).toHaveURL(/00000000--0000000004/);
  await expect(page.locator('video[aria-label="Drive video"]')).toHaveCount(1);
});

test('fresh range URL restores its canonical start without precise history', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('loadedmetadata', event => {
      if (event.target instanceof HTMLVideoElement) document.querySelector('button[aria-label="Pause"]')?.click();
    }, true);
    document.addEventListener('seeked', event => {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement) || video.currentTime < 3.9 || window.canonicalRestored) return;
      window.canonicalRestored = { time: video.currentTime, seeking: video.seeking };
    }, true);
  });
  await page.goto(`/demo/${LOG}/4/9`);
  await expect.poll(() => page.evaluate(() => window.canonicalRestored)).toBeTruthy();
  const restored = await page.evaluate(() => window.canonicalRestored);
  expect(restored.time).toBeCloseTo(4, 1);
  expect(restored.seeking).toBe(false);
  expect(await page.getByLabel('Drive video').evaluate(video => video.paused)).toBe(true);
});

test('zero-start loop stays within its selected media range', async ({ page }) => {
  await page.goto(`/demo/${LOG}/0/2`);
  const video = page.getByLabel('Drive video');
  await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThan(1);
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0.2);
  const first = await video.evaluate(element => element.currentTime);
  await page.waitForTimeout(400);
  expect(await video.evaluate(element => element.currentTime)).toBeGreaterThan(first + 0.15);
  await page.waitForTimeout(2200);
  const time = await video.evaluate(element => element.currentTime);
  expect(time).toBeGreaterThanOrEqual(0);
  expect(time).toBeLessThan(2.1);
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
});

test('slow segment fetch can be retried without replacing the video', async ({ page }) => {
  let slow = true;
  await page.route('**/part-*.ts', async route => {
    if (slow) await new Promise(resolve => setTimeout(resolve, 17000));
    await route.fallback().catch(() => {});
  });
  await page.goto(`/demo/${LOG}`);
  const video = page.getByLabel('Drive video');
  await video.evaluate(element => { window.playbackElement = element; });
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible({ timeout: 20000 });
  slow = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThan(1);
  expect(await video.evaluate(element => element === window.playbackElement)).toBe(true);
});
