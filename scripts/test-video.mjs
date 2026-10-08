// Run against `bun start`. Uses real native playback; no mocked media clock.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, devices } from 'playwright';

const baseUrl = process.env.VIDEO_TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch(process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH } : {});
const output = 'test-results/video';
await mkdir(output, { recursive: true });

async function check(name, options, logId, audio = false) {
  const context = await browser.newContext(options);
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
    await video.evaluate((element) => element.pause());
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
    if (options.isMobile) {
      const handle = await video.elementHandle();
      await page.getByText('Map', { exact: true }).click();
      assert(await handle.evaluate((element) => element === document.querySelector('video')));
      await page.waitForFunction((time) => {
        const element = document.querySelector('video');
        return element.currentTime > time + 0.5 || element.currentTime < time;
      }, await video.evaluate((element) => element.currentTime));
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      assert(await video.evaluate((element) => element.paused));
      await page.getByRole('button', { name: 'Play video', exact: true }).click();
      await page.getByText('Video', { exact: true }).click();
    }
    if (audio) {
      await video.evaluate((element) => { element.currentTime = 2; element.muted = false; });
      await page.waitForFunction(() => document.querySelector('video').webkitAudioDecodedByteCount > 0);
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
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  } catch (error) {
    await page.screenshot({ path: `${output}/${name}-failed.png`, fullPage: true });
    throw error;
  } finally {
    await context.close();
  }
}

try {
  await check('desktop-route', { viewport: { width: 1700, height: 1000 } }, '00000000--0000000004');
  await check('mobile-route', devices['Pixel 7'], '00000000--0000000004');
  await check('desktop-audio', { viewport: { width: 1280, height: 900 } }, '00000000--0000000011', true);
  await check('mobile-audio', devices['Pixel 7'], '00000000--0000000011', true);
  await check('desktop-mp4', { viewport: { width: 1280, height: 900 } }, '00000000--0000000012', true);
  await check('mobile-mp4', devices['Pixel 7'], '00000000--0000000012', true);
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/deadbeefdeadbeef/00000000--0000000007`);
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /not uploaded|unavailable|expired/);
  assert(await page.getByRole('button', { name: 'Try again' }).isVisible());
  console.log('Video playback checks passed. Screenshots: test-results/video');
} finally {
  await browser.close();
}
