// Run against `bun start`. Uses real native playback; no mocked media clock.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit, devices } from 'playwright';

const baseUrl = process.env.VIDEO_TEST_URL || 'http://localhost:3000';
const engine = process.env.VIDEO_BROWSER || 'chromium';
const browser = await { chromium, firefox, webkit }[engine].launch(engine === 'chromium' && process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH } : {});
const output = `test-results/video/${engine}`;
await mkdir(output, { recursive: true });

async function check(name, options, logId, audio = false) {
  const context = await browser.newContext(options);
  context.setDefaultTimeout(30000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/deadbeefdeadbeef/${logId}`, { waitUntil: 'domcontentloaded' });
    const video = page.getByLabel('Drive video');
    await video.waitFor();
    await page.waitForFunction(() => {
      const element = document.querySelector('video');
      return element.readyState >= 2 && element.currentTime > 1 && !element.paused;
    });
    if (options.isMobile) await video.evaluate((element) => element.pause());
    else { await video.focus(); await page.keyboard.press('Space'); }
    await page.waitForFunction(() => document.querySelector('video').paused);
    const previous = await video.evaluate((element) => element.currentTime);
    const started = Date.now();
    await page.getByLabel('Jump forward 10 seconds').click();
    await page.waitForFunction(() => {
      const element = document.querySelector('video');
      return !element.seeking && element.readyState >= 2;
    });
    assert(Math.abs(await video.evaluate((element) => element.currentTime) - previous - 10) < 0.2);
    console.log(`${name}: seek completed in ${Date.now() - started} ms`);

    if (!audio) {
      const timeline = page.getByRole('slider', { name: 'Drive timeline' });
      const bounds = await timeline.boundingBox();
      for (const fraction of [0.75, 0.2, 0.55]) await timeline.click({ position: { x: bounds.width * fraction, y: 20 } });
      // Pointer coordinates have pixel precision, especially on narrow screens.
      await page.waitForFunction((width) => {
        const element = document.querySelector('video');
        return !element.seeking && element.readyState >= 2 && Math.abs(element.currentTime - element.duration * 0.55) < element.duration / width + 0.1;
      }, bounds.width);
      assert(await video.evaluate((element) => element.paused), 'Timeline seeking must preserve pause');
      // These positions are outside the initial buffer; skip-button seeks alone
      // cannot catch expensive segment loading or a stale seek winning a race.
      for (const target of [500, 850]) {
        const started = Date.now();
        await video.evaluate((element, time) => { element.currentTime = time; }, target);
        await page.waitForFunction((time) => {
          const element = document.querySelector('video');
          return !element.seeking && element.readyState >= 2 && Math.abs(element.currentTime - time) < 0.1;
        }, target);
        console.log(`${name}: distant seek to ${target}s completed in ${Date.now() - started} ms`);
      }
      await video.evaluate((element) => { element.currentTime = 200; element.currentTime = 700; element.currentTime = 300; });
      await page.waitForFunction(() => {
        const element = document.querySelector('video');
        return !element.seeking && element.readyState >= 2 && Math.abs(element.currentTime - 300) < 0.1;
      });
    }

    await page.getByLabel('Playback speed').selectOption('2');
    assert.equal(await page.getByLabel('Playback speed').inputValue(), '2');
    assert(await video.evaluate((element) => element.paused), 'Changing speed must preserve pause');
    await video.evaluate((element) => element.play());
    assert.equal(await video.evaluate((element) => element.playbackRate), 2);
    if (options.viewport.width < 1536) {
      const handle = await video.elementHandle();
      await page.getByText('Map', { exact: true }).click();
      assert(await handle.evaluate((element) => element === document.querySelector('video')));
      const waitForMap = () => page.waitForFunction(() => {
        const map = document.querySelector('.mapboxgl-map')?.getBoundingClientRect();
        const canvas = document.querySelector('.mapboxgl-canvas')?.getBoundingClientRect();
        return map?.height >= 298 && canvas?.height >= 298 && Math.abs(map.width - canvas.width) < 1;
      });
      await waitForMap();
      if (options.viewport.width < 600) {
        await page.setViewportSize({ width: options.viewport.height, height: options.viewport.width });
        await waitForMap();
        await page.setViewportSize(options.viewport);
        await waitForMap();
      }
      await page.waitForFunction((time) => {
        const element = document.querySelector('video');
        return element.currentTime > time + 0.5 || element.currentTime < time;
      }, await video.evaluate((element) => element.currentTime));
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      assert(await video.evaluate((element) => element.paused));
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.screenshot({ path: `${output}/${name}-map.png`, fullPage: true });
      await page.getByRole('button', { name: 'Play video', exact: true }).click();
      await page.getByText('Video', { exact: true }).click();
    }
    if (audio) {
      await video.evaluate((element) => { element.currentTime = 2; element.muted = false; });
      await page.waitForFunction(() => {
        const element = document.querySelector('video');
        return element.webkitAudioDecodedByteCount > 0 || element.mozHasAudio === true;
      });
      assert.equal(await video.evaluate((element) => element.muted), false);
      await video.evaluate((element) => { element.currentTime = 11.8; });
      await page.waitForFunction(() => {
        const element = document.querySelector('video');
        return element.currentTime < 2 && !element.paused;
      });
      assert.equal(await video.evaluate((element) => element.playbackRate), 2);
    }
    assert.deepEqual(errors, []);
    if (logId.endsWith('0000000012')) {
      assert.match(await video.evaluate((element) => element.currentSrc), /audio\.mp4$/);
      const hlsLoaded = await page.evaluate(() => performance.getEntriesByType('resource').some(({ name }) => /\/hls[._-]/i.test(name)));
      assert.equal(hlsLoaded, false, 'MP4 playback must not download the HLS fallback');
    }
    await video.evaluate((element) => element.pause());
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  } catch (error) {
    await page.screenshot({ path: `${output}/${name}-failed.png`, fullPage: true, timeout: 5000 }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

async function checkRecovery() {
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  try {
    await page.route('**/demo-video/audio.mp4', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(`${baseUrl}/deadbeefdeadbeef/00000000--0000000012`);
    await page.getByRole('alert').waitFor();
    const timeline = page.getByRole('slider', { name: 'Drive timeline' });
    const bounds = await timeline.boundingBox();
    await timeline.click({ position: { x: bounds.width / 2, y: 20 } });
    assert(await page.getByRole('alert').isVisible(), 'Seeking must not dismiss a fatal media error');
    await page.getByLabel('Playback speed').selectOption('2');
    await page.locator('video').evaluate((element) => { element.muted = false; });
    await page.unroute('**/demo-video/audio.mp4');
    await page.context().setOffline(true);
    const failedRequest = page.waitForEvent('requestfailed', { predicate: (request) => request.url().endsWith('/demo-video/audio.mp4') });
    await page.getByRole('button', { name: 'Try again' }).click();
    await failedRequest;
    await page.getByRole('alert').waitFor();
    await page.context().setOffline(false);
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.waitForFunction(() => {
      const element = document.querySelector('video');
      return element.readyState >= 2 && !element.paused && element.currentTime >= 5.8 && element.currentTime < 9;
    });
    assert.equal(await page.locator('video').evaluate((element) => element.playbackRate), 2);
    assert.equal(await page.locator('video').evaluate((element) => element.muted), false);
    assert.equal(await page.getByRole('alert').count(), 0);
    console.log('HTTP failure and offline retry: restored position, speed, and unmuted playback after reconnecting');
  } finally { await page.close(); }
}

try {
  await check('desktop-route', { viewport: { width: 1700, height: 1000 } }, '00000000--0000000004');
  await check('desktop-audio', { viewport: { width: 1280, height: 900 } }, '00000000--0000000011', true);
  await check('desktop-mp4', { viewport: { width: 1280, height: 900 } }, '00000000--0000000012', true);
  if (engine === 'chromium') {
    await check('mobile-route', devices['Pixel 7'], '00000000--0000000004');
    await check('mobile-audio', devices['Pixel 7'], '00000000--0000000011', true);
    await check('mobile-mp4', devices['Pixel 7'], '00000000--0000000012', true);
  } else {
    await check('narrow-route', { viewport: { width: 390, height: 844 } }, '00000000--0000000004');
  }
  await checkRecovery();
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${baseUrl}/deadbeefdeadbeef/00000000--0000000007`);
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /not uploaded|unavailable|expired/);
  assert(await page.getByRole('button', { name: 'Try again' }).isVisible());
  console.log(`Video playback checks passed. Screenshots: ${output}`);
} finally {
  await browser.close();
}
