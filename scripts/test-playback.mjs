import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { createServer as createPortProbe } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { DEFAULT_FIXTURE_DIR, generatePlaybackFixtures } from './generate-playback-fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DONGLE = '5beb9b58bd12b691';
const PUBLIC_LOG = '0000010a--a51155e496';
const DEMO_DONGLE = 'deadbeefdeadbeef';
const START_TIME = Date.UTC(2026, 1, 1, 12);
const BASELINE_TITLE = 'Playback baseline';
const BASELINE_LOG = '00000000--0000000011';
const measurements = [];

function options(args) {
  const result = { browsers: ['chromium', 'webkit'], headed: false, serve: false, directory: DEFAULT_FIXTURE_DIR };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--headed' || flag === '--serve') result[flag.slice(2)] = true;
    else if (flag === '--browser') result.browsers = args[++index].split(',');
    else if (flag === '--playwright') result.playwright = args[++index];
    else if (flag === '--fixture-dir') result.directory = resolve(args[++index]);
    else throw new Error(`Unknown playback option: ${flag}`);
  }
  assert(result.browsers.every((browser) => ['chromium', 'webkit'].includes(browser)), 'Use --browser chromium,webkit');
  return result;
}

function json(response, value, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function sendFile(request, response, path, contentType) {
  const bytes = await readFile(path);
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || '');
  const headers = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    if (start > end || start >= bytes.length) {
      response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` });
      return response.end();
    }
    response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
    return response.end(bytes.subarray(start, end + 1));
  }
  response.writeHead(200, { ...headers, 'Content-Length': bytes.length });
  return response.end(bytes);
}

function fixtureRoute(origin, fixture) {
  return {
    fullname: `${PUBLIC_DONGLE}|${PUBLIC_LOG}`, dongle_id: PUBLIC_DONGLE, create_time: START_TIME,
    start_time_utc_millis: START_TIME, end_time_utc_millis: START_TIME + fixture.seconds * 1000 + fixture.videoStartOffset,
    segment_numbers: [0], segment_start_times: [START_TIME], segment_end_times: [START_TIME + fixture.seconds * 1000 + fixture.videoStartOffset],
    maxqlog: 0, distance: 0.1, is_public: true, share_exp: 'fixture', share_sig: 'fixture',
    start_lat: fixture.coords[0].lat, start_lng: fixture.coords[0].lng,
    end_lat: fixture.coords.at(-1).lat, end_lng: fixture.coords.at(-1).lng,
    startLocation: { place: 'Synthetic playback route', details: 'Generated locally' },
    endLocation: { place: 'Synthetic playback route end', details: 'Generated locally' },
    url: `${origin}/__playback-assets/${PUBLIC_LOG}`,
  };
}

async function startFixtureServer(directory, fixture) {
  // Relative roots work in both a browser and the demo pass-through backend.
  const environment = { VITE_COMMA_URL_ROOT: '/__playback-api/', VITE_ATHENA_URL_ROOT: '/__playback-api/', VITE_BILLING_URL_ROOT: '/__playback-api/' };
  const saved = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  const restoreEnvironment = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  };
  const requests = [];
  let stallReleased = false;
  const stalled = new Set();
  const releaseStall = () => {
    stallReleased = true;
    for (const resolve of stalled) resolve();
    stalled.clear();
  };
  const port = await new Promise((resolve, reject) => {
    const probe = createPortProbe();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
  Object.assign(process.env, environment);
  let server;
  const close = async () => {
    releaseStall();
    try { await server?.close(); }
    finally { restoreEnvironment(); }
  };
  try {
    server = await createServer({
    root, cacheDir: resolve(root, 'test-results/vite-playback-cache'), server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null },
    plugins: [{
      name: 'playback-fixture-server', enforce: 'pre',
      transform(code, id) {
        const path = id.replaceAll('\\', '/').split('?')[0];
        if (path.endsWith('/src/utils/geocode.js')) {
          return code.replace(/export const MAPBOX_STYLE = '[^']+';/, "export const MAPBOX_STYLE = '/__playback-map-style.json';");
        }
        if (path.endsWith('/src/components/DriveMap/index.jsx')) {
          // Expose the actual Mapbox instance for assertions; neither its sources
          // nor the real video element are replaced by the test.
          return code.replace('const map = mapComponent.getMap();', 'const map = mapComponent.getMap(); window.__playbackMap = map;');
        }
        return undefined;
      },
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          const origin = `http://${request.headers.host}`;
          const url = new URL(request.url, origin);
          let scenario = /(?:^|;\s*)playback-fixture=([^;]+)/.exec(request.headers.cookie || '')?.[1] || 'audio';
          if (url.searchParams.has('playback')) {
            scenario = url.searchParams.get('playback');
            response.setHeader('Set-Cookie', `playback-fixture=${scenario}; Path=/; SameSite=Lax`);
          }
          if (!fixture.scenarios.includes(scenario)) return json(response, { error: 'Unknown playback fixture' }, 400);
          const path = decodeURIComponent(url.pathname).replace(/\/$/, '');
          if (!path.startsWith('/__playback')) return next();
          const observed = { path, scenario };
          requests.push(observed);
          response.once('finish', () => { observed.status = response.statusCode; });
          try {
            if (path === '/__playback-control/reconnect') { releaseStall(); return json(response, { reconnected: true }); }
            if (path === '/__playback-map-style.json') return json(response, { version: 8, sources: {}, layers: [] });
            if (/^\/__playback-assets\/[^/]+\/0\/events.json$/.test(path)) return json(response, fixture.events);
            if (/^\/__playback-assets\/[^/]+\/0\/coords.json$/.test(path)) return json(response, scenario === 'missing-map' ? [] : fixture.coords, scenario === 'missing-map' ? 404 : 200);
            if (/^\/__playback-assets\/[^/]+\/0\/sprite.jpg$/.test(path)) return await sendFile(request, response, resolve(directory, 'sprite.jpg'), 'image/jpeg');
            const segment = /^\/__playback-media\/([\w-]+)\/(segment-\d{3}\.ts)$/.exec(path);
            if (segment) {
              if (segment[1] === 'missing-segment' && segment[2] === 'segment-002.ts') return json(response, { error: 'Missing video segment fixture' }, 404);
              if (segment[1] === 'stalled' && Number(segment[2].slice(8, 11)) >= 2 && !stallReleased) {
                await new Promise((resolve) => { stalled.add(resolve); response.once('close', resolve); });
                if (response.destroyed) return;
              }
              const variant = segment[1] === 'silent' ? 'silent' : 'audio';
              return await sendFile(request, response, resolve(directory, variant, segment[2]), 'video/mp2t');
            }
            if (path.startsWith('/__playback-api/')) {
              const apiPath = path.slice('/__playback-api'.length);
              if (apiPath.endsWith('/routes_segments')) return json(response, [fixtureRoute(origin, fixture)]);
              if (apiPath.endsWith('/files')) return json(response, { qcameras: [`${origin}/__playback-assets/${PUBLIC_LOG}/0/qcamera.ts`], qlogs: [`${origin}/__playback-assets/${PUBLIC_LOG}/0/qlog.zst`] });
              if (apiPath.endsWith('/qcamera.m3u8')) {
                if (scenario === 'fatal-manifest') return json(response, { error: 'Missing video manifest fixture' }, 404);
                const variant = scenario === 'silent' ? 'silent' : 'audio';
                const manifest = await readFile(resolve(directory, scenario === 'gap' ? 'gap.m3u8' : `${variant}/index.m3u8`), 'utf8');
                response.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
                return response.end(manifest.replace(/segment-\d{3}\.ts/g, (file) => `/__playback-media/${scenario}/${file}`));
              }
              if (apiPath.endsWith('/preserved')) return json(response, []);
              if (apiPath.endsWith('/location')) return json(response, { error: 'no_segments_uploaded' });
              if (/\/v1\.1\/devices\/[a-f0-9]+$/.test(apiPath)) return json(response, { dongle_id: DEMO_DONGLE, alias: 'Playback fixture', device_type: 'threex', is_owner: false, prime: false });
              if (apiPath.endsWith('/stats') || apiPath.includes('/prime/') || apiPath.endsWith('/turn')) return json(response, null);
              if (request.method === 'POST') return json(response, { jsonrpc: '2.0', id: 0, result: {} });
            }
            return json(response, { error: `Unhandled playback request: ${path}` }, 404);
          } catch (error) { return next(error); }
        });
      },
    }],
    });
    await server.listen();
  } catch (error) {
    await close();
    throw error;
  }
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  return { origin, requests, close, releaseStall, resetStall: () => { stallReleased = false; } };
}

async function loadPlaywright(modulePath) {
  if (modulePath || process.env.PLAYWRIGHT_MODULE) {
    const path = resolve(modulePath || process.env.PLAYWRIGHT_MODULE);
    return import(pathToFileURL(path.endsWith('.mjs') || path.endsWith('.js') ? path : resolve(path, 'index.mjs')).href);
  }
  try { return await import('playwright'); } catch {
    throw new Error('Install Playwright as described in README, or pass --playwright /path/to/playwright/index.mjs');
  }
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const [{ default: store }, { currentOffset }] = await Promise.all([import('/src/store.js'), import('/src/timeline/index.js')]);
    const video = document.querySelector('video');
    const state = store.getState();
    const ruler = document.querySelector('[aria-label="Drive timeline"]');
    let mapPoint;
    try { mapPoint = window.__playbackMap?.getSource('seekPoint')?.serialize().data.coordinates; }
    catch { /* The Mapbox instance can be between unmount and resize remount. */ }
    return { mediaTime: video?.currentTime, paused: video?.paused, muted: video?.muted, rate: video?.playbackRate,
      offset: currentOffset(), storeOffset: state.offset, startOffset: state.currentRoute?.videoStartOffset || 0,
      zoom: state.zoom, loop: state.loop, desiredPlaySpeed: state.desiredPlaySpeed, buffering: state.isBufferingVideo,
      decoded: video?.getVideoPlaybackQuality?.().totalVideoFrames || video?.webkitDecodedFrameCount || 0,
      nativeHls: video?.canPlayType('application/vnd.apple.mpegurl'), audioTracks: video?.audioTracks?.length,
      mediaSrc: video?.currentSrc || '', decodedAudioBytes: video?.webkitAudioDecodedByteCount,
      bufferedRanges: video ? Array.from({ length: video.buffered.length }, (_, index) => [video.buffered.start(index), video.buffered.end(index)]) : [],
      fullname: state.currentRoute?.fullname, routeTitles: state.routes?.map((route) => route.demo_title),
      timelinePercent: parseFloat(ruler?.firstElementChild?.style.left),
      mapPoint,
      eventCount: window.__playbackEvents.length };
  });
}

async function waitForTime(page, seconds, tolerance = 0.25) {
  await page.waitForFunction(({ seconds, tolerance }) => {
    const video = document.querySelector('video');
    return video && !video.seeking && Math.abs(video.currentTime - seconds) < tolerance;
  }, { seconds, tolerance }, { timeout: 5000 });
}

async function setPaused(page, paused) {
  const button = page.getByRole('button', { name: paused ? 'Pause' : 'Unpause', exact: true });
  if (await button.count()) await button.click();
  await page.waitForFunction((expected) => document.querySelector('video')?.paused === expected, paused);
}

async function clickTimeline(page, seconds) {
  const before = await snapshot(page);
  const ruler = page.getByRole('slider', { name: 'Drive timeline' });
  const box = await ruler.boundingBox();
  const ratio = (seconds * 1000 - before.zoom.start) / (before.zoom.end - before.zoom.start);
  await ruler.click({ position: { x: box.width * ratio, y: box.height / 2 } });
}

function assertAlignment(sample, fixture, map = true) {
  const offset = sample.mediaTime * 1000 + fixture.videoStartOffset;
  assert(Math.abs(sample.offset - offset) < 20, `Media clock mismatch: ${JSON.stringify(sample)}`);
  assert(Math.abs(sample.storeOffset - offset) <= 300, `Redux media event snapshot is stale: ${JSON.stringify(sample)}`);
  const percent = 100 * (offset - sample.zoom.start) / (sample.zoom.end - sample.zoom.start);
  assert(Math.abs(sample.timelinePercent - percent) < 1, `Timeline does not follow media: ${JSON.stringify(sample)}`);
  if (map && sample.mapPoint?.length) {
    const lng = fixture.coords[0].lng + (offset / 1000) * 0.0001;
    const lat = fixture.coords[0].lat + (offset / 1000) * 0.00005;
    assert(Math.abs(sample.mapPoint[0] - lng) < 0.00002 && Math.abs(sample.mapPoint[1] - lat) < 0.00001, `Map does not follow media: ${JSON.stringify(sample)}`);
  }
}

async function openFixture(browser, origin, scenario, forceMse = false, entry = {}) {
  const viewport = { width: 1600, height: 1000 };
  const context = await browser.newContext({ viewport, timezoneId: 'UTC' });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(({ forceMse, rejectPlayOnce }) => {
    if (forceMse) {
      // Exercise the real hls.js/MSE path on browsers that also advertise native
      // HLS. Only the capability answer changes; decode, fetches, and events run.
      const canPlayType = HTMLMediaElement.prototype.canPlayType;
      HTMLMediaElement.prototype.canPlayType = function playbackCapability(type) {
        return type === 'application/vnd.apple.mpegurl' ? '' : canPlayType.call(this, type);
      };
    }
    if (rejectPlayOnce) {
      const nativePlay = HTMLMediaElement.prototype.play;
      let rejected = false;
      HTMLMediaElement.prototype.play = function playbackPolicy() {
        if (!rejected) { rejected = true; return Promise.reject(new DOMException('Simulated browser playback rejection', rejectPlayOnce === true ? 'NotAllowedError' : rejectPlayOnce)); }
        return nativePlay.call(this);
      };
    }
    window.__playbackEvents = [];
    for (const name of ['timeupdate', 'playing', 'pause', 'seeking', 'seeked', 'waiting', 'ratechange', 'ended', 'error']) {
      document.addEventListener(name, (event) => {
        if (event.target.tagName === 'VIDEO') window.__playbackEvents.push({ name, time: event.target.currentTime, rate: event.target.playbackRate });
      }, true);
    }
  }, { forceMse, rejectPlayOnce: entry.rejectPlayOnce });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(`${origin}${entry.path || '/demo'}?playback=${scenario}&ci=1`);
  if (!entry.path) await page.getByText(BASELINE_TITLE, { exact: true }).click();
  await page.locator('video').waitFor({ state: 'attached' });
  return { page, context };
}

async function normalPlayback(browser, origin, fixture, forceMse = false) {
  const { page, context } = await openFixture(browser, origin, 'audio', forceMse);
  try {
    await setPaused(page, false);
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.5);
    await page.waitForFunction(() => window.__playbackMap?.getSource('seekPoint')?.serialize().data.coordinates.length === 2);
    const playing = await snapshot(page);
    assert(playing.decoded > 0, 'Video must decode real frames');
    const sprite = await page.locator('.thumbnailImage.images').first().evaluate(async (thumbnail) => {
      const url = getComputedStyle(thumbnail).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error(`Unable to load thumbnail sprite ${url}`));
        image.src = url;
      });
    });
    assert(sprite.width > 0 && sprite.height > 0, 'Baseline thumbnails must load real image pixels');
    assertAlignment(playing, fixture);
    await setPaused(page, true);
    const paused = await snapshot(page);
    await page.waitForTimeout(400);
    const held = await snapshot(page);
    assert(Math.abs(paused.mediaTime - held.mediaTime) < 0.02 && Math.abs(paused.offset - held.offset) < 20, 'Paused video and dependent clock must remain fixed');
    assertAlignment(held, fixture);
    if (!forceMse) await page.screenshot({ path: resolve(root, 'test-results/playback-preview.png') });

    const seekStarted = performance.now();
    await clickTimeline(page, 7.25);
    await waitForTime(page, 7.25 - fixture.videoStartOffset / 1000);
    const seekLatencyMs = Math.round(performance.now() - seekStarted);
    const afterSeek = await snapshot(page);
    assertAlignment(afterSeek, fixture);
    await page.waitForTimeout(400);
    const seeks = await page.evaluate((count) => window.__playbackEvents.slice(count).filter((event) => event.name === 'seeking').length, afterSeek.eventCount);
    assert.equal(seeks, 0, 'No repeated correction seeks after an explicit seek');
    await page.getByRole('button', { name: 'Jump back 10 seconds' }).click();
    await waitForTime(page, 0);
    await page.getByRole('button', { name: 'Jump forward 10 seconds' }).click();
    await waitForTime(page, 10);
    await clickTimeline(page, 3);
    await clickTimeline(page, 9);
    await clickTimeline(page, 5);
    await waitForTime(page, 5 - fixture.videoStartOffset / 1000);

    const unmute = page.getByRole('button', { name: 'Unmute', exact: true });
    await page.waitForFunction(() => {
      const button = document.querySelector('[aria-label="Unmute"]');
      return button && !button.disabled;
    });
    await unmute.click();
    const beforeAudio = await snapshot(page);
    await setPaused(page, false);
    await page.waitForFunction((time) => document.querySelector('video').currentTime > time + 0.6, beforeAudio.mediaTime);
    const audio = await snapshot(page);
    assert.equal(audio.muted, false, 'Audio route must be unmuted');
    assert.equal(audio.rate, 1, 'Audio route must stay at the chosen speed');
    const rates = await page.evaluate((count) => window.__playbackEvents.slice(count).filter((event) => event.name === 'ratechange').map((event) => event.rate), beforeAudio.eventCount);
    assert(rates.every((rate) => rate === 1), `Audio drift correction changed rates: ${rates}`);
    assertAlignment(audio, fixture);

    await page.setViewportSize({ width: 1200, height: 1000 });
    await page.evaluate(() => { window.__playbackOriginalVideo = document.querySelector('video'); });
    await page.getByText('Map', { exact: true }).click();
    const beforeMap = await snapshot(page);
    await page.waitForFunction((time) => document.querySelector('video')?.currentTime > time + 0.4, beforeMap.mediaTime);
    assert(await page.evaluate(() => document.querySelector('video') === window.__playbackOriginalVideo), 'Switching to Map must retain the same media element');
    await page.getByText('Video', { exact: true }).click();
    await setPaused(page, true);

    const ruler = page.getByRole('slider', { name: 'Drive timeline' });
    const box = await ruler.boundingBox();
    const range = await snapshot(page);
    const x = (seconds) => box.x + box.width * (seconds * 1000 - range.zoom.start) / (range.zoom.end - range.zoom.start);
    await page.mouse.move(x(2.5), box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x(4.5), box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForURL(/\/2\/4$/);
    const eventsBeforeLoop = (await snapshot(page)).eventCount;
    await setPaused(page, false);
    await page.waitForFunction((count) => window.__playbackEvents.slice(count).filter((event) => event.name === 'seeked').length >= 2, eventsBeforeLoop, { timeout: 10000 });
    const looped = await snapshot(page);
    assert(looped.offset >= looped.loop.startTime && looped.offset <= looped.loop.startTime + looped.loop.duration, 'Decoded loop time stays inside the selected range');
    assertAlignment(looped, fixture);
    await page.goBack();
    await page.waitForFunction(() => !/\/2\/4$/.test(location.pathname));
    await page.goForward();
    await page.waitForURL(/\/2\/4$/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByText('Map', { exact: true }).click();
    const mobileFrames = (await snapshot(page)).decoded;
    await page.waitForFunction((frames) => {
      const video = document.querySelector('video');
      return (video?.getVideoPlaybackQuality?.().totalVideoFrames || video?.webkitDecodedFrameCount || 0) > frames + 4;
    }, mobileFrames);
    assert(await page.evaluate(() => document.querySelector('video') === window.__playbackOriginalVideo), 'Mobile Map view must retain the media element');
    await page.getByText('Video', { exact: true }).click();
    const samples = [playing, held, afterSeek, audio, looped];
    measurements.push({ browser: browser.browserType().name(), transport: forceMse || playing.mediaSrc.startsWith('blob:') ? 'mse' : 'native',
      seekLatencyMs, pausedDriftMs: Math.abs(paused.mediaTime - held.mediaTime) * 1000,
      mediaClockErrorMs: Math.max(...samples.map((sample) => Math.abs(sample.offset - (sample.mediaTime * 1000 + fixture.videoStartOffset)))),
      reduxEventSnapshotErrorMs: Math.max(...samples.map((sample) => Math.abs(sample.storeOffset - (sample.mediaTime * 1000 + fixture.videoStartOffset)))),
      thumbnailPixels: sprite });
    return ['real H.264 decode', 'video/map/timeline alignment', 'loaded thumbnail sprite', 'pause freeze', 'scrub and jump controls', 'stable unmuted AAC speed', 'Map retains video', 'loop and browser history', 'mobile Map playback'];
  } catch (error) {
    console.error('Playback failure:', await snapshot(page));
    console.error('Recent media events:', await page.evaluate(() => window.__playbackEvents.slice(-15)));
    await page.screenshot({ path: resolve(root, 'test-results/playback-failure.png') });
    throw error;
  } finally { await context.close(); }
}

async function missingMapAndSilent(browser, origin, fixture, forceMse = false) {
  const checks = [];
  for (const scenario of ['missing-map', 'silent']) {
    const { page, context } = await openFixture(browser, origin, scenario, forceMse);
    try {
      await setPaused(page, false);
      await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.5);
      assertAlignment(await snapshot(page), fixture, false);
      if (scenario === 'silent') assert(await page.getByRole('button', { name: 'Unmute', exact: true }).isDisabled(), 'A silent route must not advertise audio');
      checks.push(scenario === 'silent' ? 'silent track detection' : 'video continues without GPS');
    } catch (error) {
      console.error(`Fixture failure (${scenario}${forceMse ? ', mse' : ''}):`, await snapshot(page));
      await page.screenshot({ path: resolve(root, 'test-results/playback-failure.png') });
      throw error;
    } finally { await context.close(); }
  }
  return checks;
}

async function errorAndRetry(browser, origin, fixture, forceMse = false) {
  const { page, context } = await openFixture(browser, origin, 'fatal-manifest', forceMse);
  try {
    const retry = page.getByRole('button', { name: /retry/i });
    await retry.waitFor();
    const failed = await snapshot(page);
    await page.waitForTimeout(400);
    assert(Math.abs((await snapshot(page)).offset - failed.offset) < 20, 'Video errors must freeze the dependent clock');
    await context.addCookies([{ name: 'playback-fixture', value: 'audio', url: origin }]);
    await retry.click();
    await setPaused(page, false);
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.5);
    assertAlignment(await snapshot(page), fixture);
    return ['real manifest 404', 'error freezes clock', 'retry reloads and decodes'];
  } finally { await context.close(); }
}

async function gapAndMissingSegment(browser, origin, fixture, forceMse = false) {
  const checks = [];
  for (const scenario of ['gap', 'missing-segment']) {
    const { page, context } = await openFixture(browser, origin, scenario, forceMse);
    try {
      if (scenario === 'gap') {
        await setPaused(page, false);
        await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.2);
        await clickTimeline(page, 9.5);
        await page.waitForFunction(() => document.querySelector('video')?.currentTime >= 8);
        assertAlignment(await snapshot(page), fixture);
        checks.push('seek beyond an EXT-X-GAP');
      } else {
        // A browser may skip an unavailable fragment or report a terminal error.
        // Both are usable outcomes; an endless spinner is a failure.
        await page.waitForFunction(() => document.querySelector('video')?.currentTime > 6
          || document.querySelector('[role="alert"]'), null, { timeout: 15000 });
        if (await page.getByRole('alert').count()) {
          const failed = await snapshot(page);
          await page.waitForTimeout(400);
          assert(Math.abs((await snapshot(page)).offset - failed.offset) < 20, 'A missing fragment must freeze the dependent clock');
          await context.addCookies([{ name: 'playback-fixture', value: 'audio', url: origin }]);
          await page.getByRole('button', { name: /retry/i }).click();
          await setPaused(page, false);
          await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.5);
          checks.push('missing fragment error and retry');
        } else checks.push('missing fragment recovery');
        assertAlignment(await snapshot(page), fixture);
      }
    } catch (error) {
      console.error(`Fixture failure (${scenario}${forceMse ? ', mse' : ''}):`, await snapshot(page));
      await page.screenshot({ path: resolve(root, 'test-results/playback-failure.png') });
      throw error;
    } finally { await context.close(); }
  }
  return checks;
}

async function coldEntryRoutesAndRates(browser, origin, fixture, forceMse = false) {
  const { page, context } = await openFixture(browser, origin, 'audio', forceMse,
    { path: `/${DEMO_DONGLE}/${BASELINE_LOG}/5/9` });
  try {
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video?.readyState >= 2 && !video.seeking && video.currentTime >= 3.4 && video.currentTime < 4.2;
    });
    const cold = await snapshot(page);
    assert.equal(cold.zoom.start, 5000);
    assert.equal(cold.zoom.end, 9000);
    assertAlignment(cold, fixture, false);
    await page.evaluate(() => { window.__oldRouteVideo = document.querySelector('video'); });
    const firstSrc = cold.mediaSrc;
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByText('Missing thumbnails (1 segment)', { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.5);
    const changed = await snapshot(page);
    assert.equal(changed.mediaSrc.startsWith('blob:'), firstSrc.startsWith('blob:'));
    if (!forceMse) assert.equal(changed.mediaSrc, firstSrc, 'Demo clones should share their underlying HLS URL');
    assert(await page.evaluate(() => document.querySelector('video') !== window.__oldRouteVideo), 'A different route must own a different media element');
    assertAlignment(changed, fixture, false);
    await page.getByRole('button', { name: 'Unmute', exact: true }).click();
    const samples = [];
    for (const rate of [0.5, 2, 8]) {
      await setPaused(page, true);
      await clickTimeline(page, 3);
      await waitForTime(page, 1.5);
      const currentRate = (await snapshot(page)).rate;
      const steps = [0.1, 0.25, 0.5, 1, 2, 4, 8];
      const difference = steps.indexOf(rate) - steps.indexOf(currentRate);
      for (let step = 0; step < Math.abs(difference); step += 1) {
        await page.getByRole('button', { name: difference > 0 ? 'Increase play speed by 1 step' : 'Decrease play speed by 1 step' }).click();
      }
      await setPaused(page, false);
      const before = await snapshot(page);
      await page.waitForFunction(({ time, rate }) => {
        const video = document.querySelector('video');
        return video?.playbackRate === rate && video.currentTime > time + 0.2;
      }, { time: before.mediaTime, rate });
      const sample = await snapshot(page);
      assert.equal(sample.rate, rate);
      assert.equal(sample.muted, false);
      assert(Math.abs(sample.offset - (sample.mediaTime * 1000 + fixture.videoStartOffset)) < 20, 'Every speed reads actual media time');
      const observedRates = await page.evaluate((count) => window.__playbackEvents.slice(count).filter((event) => event.name === 'ratechange').map((event) => event.rate), before.eventCount);
      assert(observedRates.every((value) => value === rate), `Unrequested audio rate correction: ${observedRates}`);
      samples.push({ requested: rate, actual: sample.rate, muted: sample.muted });
    }
    measurements.push({ browser: browser.browserType().name(), transport: cold.mediaSrc.startsWith('blob:') ? 'mse' : 'native', coldEntryOffset: cold.offset, rates: samples });
    return ['cold entry into nonzero range', 'route clones with identical stream URL', 'unmuted 0.5/2/8x rate commands'];
  } catch (error) {
    console.error('Cold entry/rate failure:', await snapshot(page));
    throw error;
  } finally { await context.close(); }
}

async function policyAndLifecycle(browser, origin, fixture, forceMse = false) {
  const { page, context } = await openFixture(browser, origin, 'audio', forceMse, { rejectPlayOnce: true });
  try {
    await page.getByRole('button', { name: 'Play video', exact: true }).waitFor();
    const blocked = await snapshot(page);
    await page.waitForTimeout(300);
    assert(Math.abs((await snapshot(page)).offset - blocked.offset) < 20, 'A simulated autoplay rejection holds position');
    await page.getByRole('button', { name: 'Play video', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.5);
    assertAlignment(await snapshot(page), fixture, false);
    const checks = ['simulated autoplay rejection and real media resume'];
    if (browser.browserType().name() === 'chromium') {
      await page.evaluate(() => { window.__lifecycleVideo = document.querySelector('video'); });
      const session = await context.newCDPSession(page);
      await session.send('Page.setWebLifecycleState', { state: 'frozen' });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await session.send('Page.setWebLifecycleState', { state: 'active' });
      await setPaused(page, false);
      const resumed = await snapshot(page);
      await page.waitForFunction((time) => document.querySelector('video')?.currentTime > time + 0.2, resumed.mediaTime);
      assert(await page.evaluate(() => document.querySelector('video') === window.__lifecycleVideo), 'Renderer lifecycle resume retains its media element');
      assertAlignment(await snapshot(page), fixture, false);
      checks.push('Chromium renderer freeze/resume');
      await session.detach();
    }
    return checks;
  } finally { await context.close(); }
}

async function simulatedNativeFallback(browser, origin, fixture) {
  const { page, context } = await openFixture(browser, origin, 'audio', false, { rejectPlayOnce: 'NotSupportedError' });
  try {
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video?.currentSrc.startsWith('blob:') && video.currentTime > 0.5;
    });
    const sample = await snapshot(page);
    assert(sample.decoded > 0, 'The MSE fallback must decode actual frames');
    assert(!(await page.getByRole('alert').count()), 'A native capability mismatch should recover through MSE');
    assertAlignment(sample, fixture, false);
    return ['simulated native unsupported rejection with real MSE fallback'];
  } finally { await context.close(); }
}

async function stallOfflineAndReconnect(browser, server, fixture, forceMse = false) {
  server.resetStall();
  const { page, context } = await openFixture(browser, server.origin, 'stalled', forceMse);
  try {
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.5);
    await snapshot(page);
    // Seeking beyond the available first two fragments removes transient
    // decoder warmup from this assertion and exercises a pending user target.
    await clickTimeline(page, 9.5);
    await page.waitForFunction(async () => {
      const video = document.querySelector('video');
      return video.seeking && Math.abs(video.currentTime - 8) < 0.1
        && (await import('/src/store.js')).default.getState().isBufferingVideo;
    });
    const stalled = await snapshot(page);
    await page.waitForTimeout(400);
    const held = await snapshot(page);
    assert(Math.abs(held.mediaTime - stalled.mediaTime) < 0.05 && Math.abs(held.offset - stalled.offset) < 50, 'An actual blocked fragment holds media and dependent time');
    await context.setOffline(true);
    await page.waitForTimeout(400);
    await context.setOffline(false);
    server.releaseStall();
    const retry = page.getByRole('button', { name: /retry/i });
    if (await retry.count()) { await retry.click(); await setPaused(page, false); }
    await page.waitForFunction((time) => document.querySelector('video')?.currentTime > time + 0.2, held.mediaTime, { timeout: 10000 });
    assertAlignment(await snapshot(page), fixture, false);
    return ['unbuffered network seek holds its target', 'offline/reconnect returns to decoded playback'];
  } catch (error) {
    console.error('Network stall failure:', await snapshot(page));
    throw error;
  } finally { server.releaseStall(); await context.close(); }
}

async function hlsCapabilities(browser) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const native = Boolean(document.createElement('video').canPlayType('application/vnd.apple.mpegurl'));
      const mse = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
      return { native, mse, supported: native || mse };
    });
  } finally { await page.close(); }
}

const config = options(process.argv.slice(2));
let fixture;
try {
  fixture = JSON.parse(await readFile(resolve(config.directory, 'fixture.json'), 'utf8'));
  if (fixture.version !== 2) throw new Error('Regenerate updated fixture metadata');
}
catch { fixture = await generatePlaybackFixtures(config.directory, process.env.FFMPEG || 'ffmpeg'); }
const server = await startFixtureServer(config.directory, fixture);
if (config.serve) {
  console.log(`Local audio demo: ${server.origin}/demo?playback=audio`);
  console.log(`Other scenarios: ${fixture.scenarios.join(', ')} (set ?playback=...)`);
  console.log('Select Playback baseline. Ctrl+C stops the fixture server.');
  process.once('SIGINT', async () => { await server.close(); process.exit(0); });
} else {
  const results = [];
  const startedAt = new Date().toISOString();
  let failed = false;
  try {
    const playwright = await loadPlaywright(config.playwright);
    for (const name of config.browsers) {
      const browser = await playwright[name].launch({ headless: !config.headed,
        ...(name === 'chromium' ? { args: ['--enable-unsafe-swiftshader'] } : {}) });
      let transport;
      try {
        const capabilities = await hlsCapabilities(browser);
        if (!capabilities.supported) {
          const reason = 'Browser build has neither native HLS nor H.264/AAC MediaSource support';
          results.push({ browser: name, version: browser.version(), status: 'unsupported', capabilities, reason });
          console.log(`SKIP ${name} HLS playback: ${reason}`);
          continue;
        }
        transport = capabilities.native ? 'native' : 'mse';
        const checks = [
          ...await normalPlayback(browser, server.origin, fixture),
          ...await missingMapAndSilent(browser, server.origin, fixture),
          ...await errorAndRetry(browser, server.origin, fixture),
          ...await gapAndMissingSegment(browser, server.origin, fixture),
          ...await coldEntryRoutesAndRates(browser, server.origin, fixture),
          ...await policyAndLifecycle(browser, server.origin, fixture),
          ...await stallOfflineAndReconnect(browser, server, fixture),
        ];
        if (capabilities.native && capabilities.mse) checks.push(...await simulatedNativeFallback(browser, server.origin, fixture));
        results.push({ browser: name, version: browser.version(), status: 'passed', transport, capabilities, checks });
        console.log(`PASS ${name} ${transport}: ${checks.join(', ')}`);
        if (capabilities.native && capabilities.mse) {
          transport = 'mse';
          const mseChecks = [
            ...await normalPlayback(browser, server.origin, fixture, true),
            ...await missingMapAndSilent(browser, server.origin, fixture, true),
            ...await errorAndRetry(browser, server.origin, fixture, true),
            ...await gapAndMissingSegment(browser, server.origin, fixture, true),
            ...await coldEntryRoutesAndRates(browser, server.origin, fixture, true),
            ...await policyAndLifecycle(browser, server.origin, fixture, true),
            ...await stallOfflineAndReconnect(browser, server, fixture, true),
          ];
          results.push({ browser: name, version: browser.version(), status: 'passed', transport, checks: mseChecks });
          console.log(`PASS ${name} mse: ${mseChecks.join(', ')}`);
        }
      } catch (error) {
        failed = true;
        results.push({ browser: name, version: browser.version(), status: 'failed', transport, error: error.message });
        console.error(`FAIL ${name}: ${error.stack}`);
      } finally { await browser.close(); }
    }
    assert(results.some((result) => result.status === 'passed'), 'No requested browser completed decoded playback tests');
    if (failed) process.exitCode = 1;
  } finally {
    try {
      const destination = resolve(root, 'test-results/playback-report.json');
      assert(destination.startsWith(`${root}${sep}`));
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, `${JSON.stringify({ startedAt, fixture: fixture.provenance, measurements, requests: server.requests, results }, null, 2)}\n`);
      console.log(`Playback report: ${destination}`);
    } finally { await server.close(); }
  }
}
