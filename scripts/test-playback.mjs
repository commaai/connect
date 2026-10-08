// Decodes real H.264/AAC HLS through DriveVideo. No mocked media events or clock.
/* eslint-disable no-await-in-loop -- serialize browser scenarios to avoid resource contention */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const fixtures = await mkdtemp(resolve(tmpdir(), 'connect-playback-'));
const enabled = new Set(['normal', 'fallback', 'segments', 'empty']);
const requests = new Map();
let server, browser;
try {
  await promisify(execFile)(process.env.FFMPEG_PATH ?? 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '120',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-crf', '30',
    '-g', '20', '-sc_threshold', '0', '-c:a', 'aac', '-b:a', '64k',
    '-hls_time', '2', '-hls_list_size', '0', '-hls_segment_filename', resolve(fixtures, 'segment-%03d.ts'),
    resolve(fixtures, 'stream.m3u8'),
  ]);
  server = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{
    name: 'playback-regression-fixture',
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        try {
          const url = new URL(request.url, 'http://localhost');
          if (url.pathname === '/__playback-test') {
            response.setHeader('Content-Type', 'text/html');
            response.end(await vite.transformIndexHtml(url.pathname, await readFile('scripts/playback-test.html', 'utf8')));
            return;
          }
          const match = url.pathname.match(/^\/__media\/(\w+)\/(stream\.m3u8|segment-\d+\.ts)$/);
          if (!match) { next(); return; }
          const [, profile, file] = match;
          const key = `${profile}/${file}`;
          requests.set(key, (requests.get(key) ?? 0) + 1);
          response.setHeader('Cache-Control', 'no-store');
          if (!enabled.has(profile) || (profile === 'segments' && file.startsWith('segment-04'))) {
            response.statusCode = 404; response.end('Missing media'); return;
          }
          if (profile === 'fallback' && file === 'stream.m3u8' && requests.get(key) === 1) {
            response.end('Native stream failed'); return;
          }
          if (profile === 'empty' && file === 'stream.m3u8' && requests.get(key) === 1) {
            response.end('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-ENDLIST\n'); return;
          }
          response.setHeader('Content-Type', file.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl');
          response.end(await readFile(resolve(fixtures, file)));
        } catch (error) { response.statusCode = 500; response.end(error.message); }
      });
    },
  }] });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const profile of process.env.TEST_PROFILE ? [process.env.TEST_PROFILE] : ['normal', 'fallback', 'missing', 'empty', 'segments']) {
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/__playback-test?profile=${profile}`);
      const ready = () => page.waitForFunction(() => {
        const { video } = window.playback;
        return video?.readyState >= 3 && !video.paused && video.currentTime > 0;
      }, { timeout: 30000 });
      const seek = async (position) => {
        await page.evaluate((target) => { window.playback.target = target; }, position);
        await page.click('#seek');
      };
      if (profile === 'missing') {
        await page.waitForSelector('[role="alert"]');
        enabled.add(profile);
        await seek(30000);
      }
      if (profile === 'empty') {
        await page.waitForSelector('[role="alert"]');
        await page.evaluate(() => { document.querySelector('[role="alert"]').parentElement.querySelector('button').click(); });
      }
      await ready();
      assert(await page.evaluate(() => window.playback.video.getVideoPlaybackQuality().totalVideoFrames > 0));
      assert(await page.evaluate(() => window.playback.video.webkitAudioDecodedByteCount > 0));
      if (profile === 'fallback') assert(requests.get('fallback/stream.m3u8') >= 2);
      if (profile === 'segments') {
        await seek(90000);
        await page.waitForSelector('[role="alert"]', { timeout: 10000 });
        await seek(10000);
        await ready();
        assert(await page.evaluate(() => !document.querySelector('[role="alert"]')));
        console.log('PASS: unavailable segment recovery');
        continue;
      }
      await page.click('#unmute');
      await page.click('#pause');
      await seek(12000);
      await page.waitForFunction(() => !window.playback.video.seeking && window.playback.video.currentTime === 12);
      assert(await page.evaluate(() => window.playback.video.paused && window.playback.store.getState().desiredPlaySpeed === 0));
      for (const position of [50000, 5000, 70000, 12000]) {
        await seek(position);
        await page.waitForFunction((target) => !window.playback.video.seeking && window.playback.video.currentTime === target / 1000, {}, position);
      }
      await page.evaluate(() => window.playback.store.dispatch({
        type: 'ACTION_UPDATE_ROUTE_EVENTS', fullname: window.playback.store.getState().currentRoute.fullname,
        events: [{ type: 'event', data: { event_type: 'first_road_camera_frame' }, route_offset_millis: 3000 }],
      }));
      assert.equal(await page.evaluate(() => window.playback.video.currentTime), 12);
      assert.equal(await page.evaluate(() => window.playback.store.getState().offset), 15000);
      await page.click('#map');
      await page.click('#speed');
      await ready();
      assert.equal(await page.evaluate(() => window.playback.video.playbackRate), 2);
      assert(await page.evaluate(() => !window.playback.video.muted));
      await page.click('#map');
      await page.click('#pause');
      // Seek outside the existing buffer while offline, then restore the network.
      await page.setOfflineMode(true);
      await seek(119000);
      await page.waitForFunction(() => window.playback.store.getState().isBufferingVideo);
      assert(await page.evaluate(() => window.playback.video.paused));
      await page.setOfflineMode(false);
      await page.click('#play');
      await ready();
      await page.click('#loop');
      await page.waitForFunction(() => window.playback.store.getState().offset >= 3000 && window.playback.store.getState().offset <= 4000);
      await page.waitForFunction(() => {
        const offset = window.playback.store.getState().offset;
        const wrapped = offset < window.playback.previousOffset;
        window.playback.previousOffset = offset;
        return wrapped;
      });
      await page.click('#pause');
      assert(await page.evaluate(() => window.playback.store.getState().desiredPlaySpeed === 0));
      assert.deepEqual(errors, []);
      console.log(`PASS: ${profile}, H.264/AAC decode, audio, paused seeking, late metadata, map, speed, offline recovery, range`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  await server?.close();
  await rm(fixtures, { recursive: true, force: true });
}
