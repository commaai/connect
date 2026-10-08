/* eslint-disable no-await-in-loop -- one real decoder and serialized cases keep resource use bounded */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = resolve(root, 'scripts/playback/fixtures');
const options = { output: resolve(root, 'test-results/playback'), case: '' };

const scenarios = new Map();
function scenario() {
  return { holdManifest: false, holdFrom: Infinity, failFrom: Infinity, missingManifest: false,
    fragmentFault: null, requests: [], measurements: {}, pending: new Set() };
}
export function release(control) {
  const pending = [...control.pending];
  control.pending.clear();
  pending.forEach((send) => send());
}
function mediaMiddleware(request, response, next) {
  const url = new URL(request.url, 'http://localhost');
  const match = url.pathname.match(/^\/__media\/([^/]+)\/[^/]+\/(audio\.m3u8|segment-\d{3}\.ts)$/);
  if (!match) return next();
  const [, run, filename] = match;
  const control = scenarios.get(run);
  if (!control) { response.statusCode = 404; response.end(); return; }
  const segment = filename === 'audio.m3u8' ? null : Number(filename.match(/\d+/)[0]);
  const receipt = { url: url.pathname + url.search, segment, at: Date.now(), status: null };
  control.requests.push(receipt);
  response.once('close', () => {
    receipt.closedAt = Date.now();
    receipt.aborted = !response.writableEnded;
  });
  const send = async () => {
    if (response.destroyed) return;
    const failed = segment === null ? control.missingManifest : segment >= control.failFrom;
    receipt.status = failed ? 404 : 200;
    const fault = control.fragmentFault;
    if (segment !== null && segment >= fault?.from && fault.remaining > 0) {
      fault.remaining -= 1;
      receipt.faultAt = Date.now();
      receipt.fault = fault.status === null ? 'timeout' : `http-${fault.status}`;
      receipt.status = fault.status;
      // Leave this actual HTTP response open until the production loader's
      // default first-byte timeout aborts it; only subsequent requests succeed.
      if (fault.status === null) return;
    }
    receipt.respondedAt = Date.now();
    response.statusCode = receipt.status;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', segment === null ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
    if (receipt.status !== 200) { response.end('Controlled media failure'); return; }
    try { response.end(await readFile(resolve(fixtureRoot, filename))); }
    catch (error) { receipt.status = 500; response.statusCode = 500; response.end(error.message); }
  };
  if ((segment === null && control.holdManifest) || (segment !== null && segment >= control.holdFrom)) {
    control.pending.add(send);
    response.on('close', () => control.pending.delete(send));
  } else void send();
}

const snapshot = (page) => page.evaluate(() => window.playbackHarness.snapshot());
async function wait(page, predicate, label, argument = null, timeout = 15000) {
  try {
    await page.waitForFunction((source, arg) => {
      const value = window.playbackHarness?.snapshot();
      // Puppeteer serializes the small assertion predicate, never app/media state.
      return value && Function('s', 'arg', `return (${source})(s, arg)`)(value, arg);
    }, { timeout, polling: 'raf' }, predicate.toString(), argument);
  } catch (error) {
    throw new Error(`${label}: ${JSON.stringify(await snapshot(page))}`, { cause: error });
  }
  return snapshot(page);
}
const command = (page, name, ...args) => page.evaluate((method, values) => window.playbackHarness[method](...values), name, args);
const click = (page, label) => page.click(`[aria-label="${label}"]`);
async function tab(page, label) {
  const target = await page.evaluateHandle((text) => [...document.querySelectorAll('p')].find((element) => element.textContent === text), label);
  assert(target.asElement(), `Missing ${label} tab`);
  await target.asElement().click();
  await target.dispose();
}
async function ready(page) {
  return wait(page, (s) => s.readyState >= 3 && s.decodedFrames > 0 && !s.seeking && !s.spinner, 'decoded frame ready');
}
async function moving(page) {
  const before = await snapshot(page);
  return wait(page, (s, old) => !s.paused && s.decodedFrames > old.decodedFrames + 2 && s.currentTime > old.currentTime + 0.1,
    'decoded playback advances', before);
}
async function stablePause(page, target) {
  await wait(page, (s, time) => s.paused && s.desiredSpeed === 0 && !s.seeking && s.readyState >= 3 && Math.abs(s.currentTime - time) < 0.06,
    'paused seek settled', target);
  const samples = await page.evaluate(async () => {
    const values = [];
    for (let index = 0; index < 24; index++) {
      await new Promise(requestAnimationFrame);
      values.push(window.playbackHarness.snapshot());
    }
    return values;
  });
  for (const sample of samples) {
    assert.equal(sample.paused, true);
    assert.equal(sample.desiredSpeed, 0);
    assert(Math.abs(sample.currentTime - target) < 0.06, 'paused media drifted');
    assert(Math.abs(sample.offset - (sample.currentTime * 1000 + (sample.origin || 0))) < 2, 'route clock disagrees with media');
    assert.equal(sample.spinner, false);
  }
  return samples.at(-1);
}
function sourceChangeCase(gated) {
  return {
    name: gated ? 'source-switch-loading-pause' : 'signed-url-refresh-and-route-source-change',
    async run({ page, control }) {
      await ready(page);
      await command(page, 'seek', 7000);
      const original = await stablePause(page, 7);
      const mark = control.requests.length;
      await command(page, 'refresh');
      await wait(page, (s) => s.signature === 'refreshed' && s.readyState >= 3 && !s.seeking, 'signed source refresh');
      await stablePause(page, 7);
      assert(control.requests.slice(mark).some((request) => request.segment === null && request.url.includes('signature=refreshed')));
      control.holdManifest = gated;
      const eventMark = await page.evaluate(() => window.playbackHarness.events().length);
      await command(page, 'selectRoute', 1);
      if (gated) {
        // The other case preserves the ungated, immediately dispatched pause
        // that first exposed the race. This case observes the loading phase.
        await page.waitForFunction((start, previousRoute) => {
          const state = window.playbackHarness.snapshot();
          return state.route !== previousRoute && state.readyState === 0 && !state.paused
            && window.playbackHarness.events().slice(start).some((event) => (
              event.event === 'play' && event.route === state.route && event.readyState === 0
            ));
        }, { timeout: 10000 }, eventMark, original.route);
      }
      await command(page, 'pause');
      control.holdManifest = false;
      release(control);
      await stablePause(page, 0);
      const changed = await snapshot(page);
      assert.notEqual(changed.route, original.route);
      assert.equal(changed.mediaId, original.mediaId);
      assert(control.requests.some((request) => request.segment === null && request.url.includes(encodeURIComponent(changed.route))));
      await click(page, 'Unpause');
      await moving(page);
    },
  };
}

function transientFragmentCase(count, status) {
  const timeout = status === null;
  return {
    name: timeout ? 'fragment-timeout-recovers' : `fragment-${status}-${count}-retries-recover`,
    setup: (control) => {
      control.holdFrom = 4;
      control.fragmentFault = { from: 4, remaining: count, status };
    },
    async run({ page, control }) {
      await ready(page);
      await click(page, 'Unpause');
      await moving(page);
      await click(page, 'Increase play speed by 1 step');
      await click(page, 'Unmute');
      await wait(page, (s) => s.rate === 2 && !s.muted && !s.paused, 'nondefault transport before transient fault');
      await command(page, 'seek', 6000);
      await wait(page, (s) => !s.seeking && s.currentTime >= 6, 'decoded pre-fault playback');
      const before = await snapshot(page);
      control.holdFrom = Infinity;
      release(control);
      const recovered = await wait(page, (s) => s.currentTime > 8.2 && s.readyState >= 3 && !s.spinner && !s.error,
        'transient fragment fault recovers without Retry or Play', null, 30000);
      assert.equal(recovered.mediaId, before.mediaId);
      assert.equal(recovered.desiredSpeed, 2, 'transient faults retain playback intent');
      assert.equal(recovered.rate, 2, 'transient recovery retains selected rate');
      assert.equal(recovered.muted, false, 'transient recovery retains user unmute');
      await moving(page);
      const faults = control.requests.filter((request) => request.fault);
      assert.equal(faults.length, count, 'all configured real HTTP faults must occur');
      assert.equal(control.fragmentFault.remaining, 0);
      assert(control.requests.some((request) => request.segment === faults[0].segment && request.status === 200
        && request.at > faults.at(-1).faultAt), 'the failed fragment must load successfully on a subsequent request');
      assert.equal(control.requests.filter((request) => request.segment === null).length, 1,
        'transient recovery must use the existing source session');
      if (timeout) {
        assert.equal(faults[0].status, null, 'timeout response sends no HTTP status or body');
        assert.equal(faults[0].aborted, true, 'the real loader must abort the held HTTP response');
        // The loader's timer starts with the request, before the test releases its hold.
        control.measurements.fragmentTimeoutMs = faults[0].closedAt - faults[0].at;
        assert(control.measurements.fragmentTimeoutMs >= 9500, 'exercise the default 10-second first-byte timeout');
      } else {
        assert(faults.every((request) => request.status === status));
      }
    },
  };
}

const cases = [
  {
    name: 'paused-and-rapid-seeks-audio',
    async run({ page }) {
      await ready(page);
      await click(page, 'Unpause');
      const playing = await moving(page);
      if (playing.decodedAudioBytes !== null) assert(playing.decodedAudioBytes > 0, 'AAC audio must actually decode');
      await wait(page, (s) => s.audioEnabled, 'audio track discovered');
      await click(page, 'Unmute');
      await wait(page, (s) => !s.muted && !s.paused, 'unmute retains playback');
      await command(page, 'seek', 12000);
      await wait(page, (s) => s.currentTime >= 12 && !s.seeking, 'playing seek');
      await click(page, 'Pause');
      await wait(page, (s) => s.paused && s.desiredSpeed === 0, 'user pause');
      await page.evaluate(() => [3000, 17000, 6000].forEach(window.playbackHarness.seek));
      await stablePause(page, 6);
      await click(page, 'Jump forward 10 seconds');
      const paused = await stablePause(page, 16);
      assert.match(paused.clockText, /00:00:16/);
      await click(page, 'Unpause');
      await moving(page);
    },
  },
  {
    name: 'before-metadata-latest-intent',
    setup: (control) => { control.holdManifest = true; },
    async run({ page, control }) {
      await wait(page, (s) => s.mediaId && s.readyState === 0, 'metadata is gated');
      await click(page, 'Unpause');
      await wait(page, (s) => !s.paused && s.readyState === 0, 'pending native play');
      await page.evaluate(() => {
        [3000, 17000, 6000].forEach(window.playbackHarness.seek);
        document.querySelector('video').pause(); // Actual browser pause, no synthetic event.
      });
      await wait(page, (s) => s.paused && s.desiredSpeed === 0, 'external pause before metadata');
      control.holdManifest = false;
      release(control);
      await stablePause(page, 6);
      const events = await page.evaluate(() => window.playbackHarness.events());
      assert(events.find((event) => event.event === 'pause' && event.readyState === 0));
      await click(page, 'Unpause');
      await moving(page);
    },
  },
  {
    name: 'nonzero-loop-at-8x',
    async run({ page }) {
      await ready(page);
      await command(page, 'loop', 4000, 8000);
      await command(page, 'seek', 4000);
      await stablePause(page, 4);
      for (let index = 0; index < 3; index++) await click(page, 'Increase play speed by 1 step');
      await wait(page, (s) => s.rate === 8 && !s.paused, '8x playback');
      const mark = await page.evaluate(() => window.playbackHarness.events().length);
      await page.waitForFunction((start) => window.playbackHarness.events().slice(start)
        .filter((event) => event.event === 'seeking' && Math.abs(event.time - 4) < 0.1).length >= 2, { timeout: 15000 }, mark);
      await click(page, 'Pause');
      const state = await wait(page, (s) => s.paused && !s.seeking, 'loop pause');
      assert(state.currentTime >= 4 && state.currentTime < 8.3);
      assert.equal(state.loop.startTime, 4000);
      assert.equal(state.loop.duration, 4000);
      assert.equal(state.mediaId, 1);
    },
  },
  {
    name: 'map-video-identity-and-height',
    async run({ page }) {
      await ready(page);
      await command(page, 'seek', 6000);
      const original = await stablePause(page, 6);
      for (const width of [390, 900]) {
        await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
        await tab(page, 'Map');
        const mapped = await wait(page, (s) => s.mapVisible && s.wrapper.height === 300, 'map retains 300px layout');
        assert.equal(mapped.wrapper.overflow, 'hidden');
        assert.equal(mapped.mediaId, original.mediaId);
        await tab(page, 'Video');
        const restored = await stablePause(page, 6);
        assert.equal(restored.mediaId, original.mediaId);
        assert.equal(restored.mapVisible, false);
      }
      await click(page, 'Unpause');
      await moving(page);
    },
  },
  {
    name: 'manifest-404-retry-stays-paused',
    setup: (control) => { control.missingManifest = true; },
    async run({ page, control }) {
      const failed = await wait(page, (s) => Boolean(s.error) && !s.spinner, '404 becomes terminal', null, 90000);
      assert.equal(failed.desiredSpeed, 0);
      assert.equal(failed.offset, 0);
      const requests = control.requests.length;
      control.missingManifest = false;
      const retry = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Retry'));
      await retry.asElement().click();
      await retry.dispose();
      await ready(page);
      const recovered = await stablePause(page, 0);
      assert.equal(recovered.mediaId, failed.mediaId);
      assert(control.requests.slice(requests).some((request) => request.segment === null && request.status === 200));
      await click(page, 'Unpause');
      await moving(page);
    },
  },
  {
    name: 'held-fragment-stall-pause-and-resume',
    setup: (control) => { control.holdFrom = 4; },
    async run({ page, control }) {
      await ready(page);
      await click(page, 'Unpause');
      await moving(page);
      await command(page, 'seek', 6000);
      const stalled = await wait(page, (s) => !s.paused && !s.seeking && s.readyState < 3 && s.currentTime > 7.5 && s.spinner,
        'real decoder stalls at held fragment');
      const samples = await page.evaluate(async () => {
        const values = [];
        for (let index = 0; index < 24; index++) {
          await new Promise(requestAnimationFrame);
          values.push(window.playbackHarness.snapshot());
        }
        return values;
      });
      for (const sample of samples) {
        assert(Math.abs(sample.currentTime - stalled.currentTime) < 0.03, 'stalled video advanced');
        assert(Math.abs(sample.offset - sample.currentTime * 1000) < 2, 'stalled route clock advanced independently');
      }
      await click(page, 'Pause');
      await wait(page, (s) => s.paused && s.desiredSpeed === 0 && !s.spinner, 'pause clears active buffering');
      control.holdFrom = Infinity;
      release(control);
      await ready(page);
      assert.equal((await snapshot(page)).paused, true, 'arrival of data must not undo pause');
      await click(page, 'Unpause');
      await moving(page);
    },
  },
  {
    name: 'midstream-fault-map-play-recovery',
    setup: (control) => { control.holdFrom = 4; },
    async run({ page, control }) {
      await ready(page);
      await click(page, 'Unpause');
      await moving(page);
      await click(page, 'Increase play speed by 1 step');
      await click(page, 'Unmute');
      await wait(page, (s) => s.rate === 2 && !s.muted && !s.paused, 'nondefault rate and unmuted playback');
      await command(page, 'seek', 6000);
      await wait(page, (s) => !s.paused && !s.seeking && s.currentTime >= 6, 'decoded pre-fault playback');
      await tab(page, 'Map');
      const before = await wait(page, (s) => s.mapVisible, 'map selected before fault');
      control.failFrom = 4;
      control.holdFrom = Infinity;
      const faultStarted = Date.now();
      release(control); // Real HTTP 404s begin only after playback and Map were observed.
      const failed = await wait(page, (s) => Boolean(s.error) && !s.spinner, 'midstream missing fragment settles promptly', null, 5000);
      control.measurements.missingFragmentErrorMs = Date.now() - faultStarted;
      assert(control.measurements.missingFragmentErrorMs <= 5000, 'a listed missing fragment must not incur the normal retry backoff');
      const missingRequests = control.requests.filter((request) => request.segment !== null && request.status === 404);
      assert(missingRequests.length > 0 && missingRequests.length <= 2, 'missing footage must stop repeated 404 requests');
      assert.equal(failed.mediaId, before.mediaId);
      assert.equal(failed.desiredSpeed, 0, 'terminal media failure must expose paused intent, including in Map');
      assert.equal(failed.playLabel, 'Unpause', 'Map must offer Play after terminal failure');
      const mark = control.requests.length;
      const eventMark = await page.evaluate(() => window.playbackHarness.events().length);
      control.failFrom = Infinity;
      await click(page, 'Unpause'); // Existing transport control must recover; Retry is hidden by Map.
      await ready(page);
      await moving(page);
      const restored = await snapshot(page);
      assert.equal(restored.mediaId, before.mediaId);
      assert.equal(restored.mapVisible, true);
      assert.equal(restored.rate, 2, 'recovery retains selected rate');
      assert.equal(restored.muted, false, 'recovery retains user unmute');
      const firstPlaying = await page.evaluate((start) => window.playbackHarness.events().slice(start).find((event) => event.event === 'playing'), eventMark);
      assert(firstPlaying && Math.abs(firstPlaying.time - failed.offset / 1000) < 0.3, 'recovery resumes at failed position');
      assert(control.requests.slice(mark).some((request) => request.segment === null && request.status === 200), 'Play must reload the failed source');
      await tab(page, 'Video');
      await wait(page, (s) => !s.mapVisible && !s.error && !s.paused, 'Video returns to recovered playback');
    },
  },
  ...[1, 2, 3].map((count) => transientFragmentCase(count, 503)),
  transientFragmentCase(1, 404),
  transientFragmentCase(1, null),
  sourceChangeCase(false),
  sourceChangeCase(true),
  {
    name: 'late-origin-paused-clip',
    query: '&origin=unknown',
    async run({ page }) {
      await ready(page);
      await command(page, 'loop', 10000, 20000);
      await command(page, 'seek', 10000);
      await stablePause(page, 10);
      const mark = await page.evaluate(() => window.playbackHarness.events().length);
      await command(page, 'origin', 3000);
      const corrected = await stablePause(page, 7);
      assert.equal(corrected.offset, 10000);
      assert.match(corrected.clockText, /00:00:10/);
      const events = await page.evaluate((start) => window.playbackHarness.events().slice(start), mark);
      assert.equal(events.filter((event) => event.event === 'seeking').length, 1, 'origin correction seeks exactly once');
    },
  },
];

async function runCase(browser, origin, specification, index) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const control = scenario();
  const run = `case-${index}`;
  scenarios.set(run, control);
  specification.setup?.(control);
  const failures = [];
  const started = Date.now();
  try {
    await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
    await page.emulateTimezone('UTC');
    page.on('pageerror', (error) => failures.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin === origin || ['blob:', 'data:'].includes(url.protocol)) { void request.continue(); return; }
      // Render the actual map with a local style, without map tiles, GPS or API requests.
      if (url.hostname === 'fonts.googleapis.com') {
        void request.respond({ status: 200, contentType: 'text/css', body: '' });
      } else if (url.hostname === 'api.mapbox.com' && url.pathname.startsWith('/styles/')) {
        void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#223344' } }] }) });
      } else if (url.hostname.endsWith('mapbox.com')) {
        void request.respond({ status: 200, contentType: 'application/json', body: '{}' });
      } else {
        failures.push(`Unexpected external request: ${url.origin}${url.pathname}`);
        void request.abort('blockedbyclient');
      }
    });
    await page.goto(`${origin}/scripts/playback/index.html?run=${run}${specification.query || ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.playbackHarness));
    const codecs = await page.evaluate(() => ({
      video: MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"'),
      audio: MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"'),
    }));
    assert(codecs.video && codecs.audio, `Browser lacks required H.264/AAC decoding: ${JSON.stringify(codecs)}`);
    await specification.run({ page, control });
    assert.deepEqual(failures, [], 'uncaught page errors or unexpected external requests');
    const result = { name: specification.name, passed: true, milliseconds: Date.now() - started,
      final: await snapshot(page), events: await page.evaluate(() => window.playbackHarness.events()),
      requests: control.requests, measurements: control.measurements };
    console.log(`PASS ${specification.name} (${result.milliseconds}ms)`);
    return result;
  } catch (error) {
    const artifact = resolve(options.output, specification.name);
    await mkdir(artifact, { recursive: true });
    await page.screenshot({ path: resolve(artifact, 'failure.png'), fullPage: true }).catch(() => {});
    const state = await snapshot(page).catch(() => null);
    const events = await page.evaluate(() => window.playbackHarness?.events()).catch(() => null);
    const result = { name: specification.name, passed: false, milliseconds: Date.now() - started,
      error: error.stack, final: state, failures, events, requests: control.requests, measurements: control.measurements };
    await writeFile(resolve(artifact, 'trace.json'), JSON.stringify(result, null, 2));
    console.error(`FAIL ${specification.name}: ${error.message}\nArtifacts: ${artifact}`);
    return result;
  } finally {
    await context.close();
    control.holdManifest = false;
    control.holdFrom = Infinity;
    release(control);
    scenarios.delete(run);
  }
}

// The exported server also supports temporary manual QA drivers. It has no HTTP
// control API: fault state is accessible only to its owning Node process.
export async function createPlaybackServer() {
  await readFile(resolve(fixtureRoot, 'audio.m3u8'));
  const temporary = await mkdtemp(resolve(tmpdir(), 'connect-playback-'));
  const player = await readFile(resolve(root, 'src/components/DriveVideo/index.jsx'));
  const playerSha256 = createHash('sha256').update(player).digest('hex');
  let server;
  try {
    await build({
      root, configFile: false, mode: 'test', publicDir: false, logLevel: 'error',
      plugins: [{
        name: 'playback-local-fonts', enforce: 'pre',
        transform(source, id) { return id.endsWith('/src/index.css') ? source.replace(/^@import[^\n]*fonts\.googleapis\.com[^\n]*\n/m, '') : null; },
      }, react(), tailwindcss()],
      build: { outDir: temporary, emptyOutDir: true, sourcemap: false,
        rollupOptions: { input: resolve(root, 'scripts/playback/index.html') } },
    });
    server = await preview({ root, configFile: false, build: { outDir: temporary },
      preview: { host: '127.0.0.1', port: 0, strictPort: true },
      plugins: [{ name: 'playback-media', configurePreviewServer({ middlewares }) { middlewares.use(mediaMiddleware); } }],
    });
    const afterBuild = createHash('sha256').update(await readFile(resolve(root, 'src/components/DriveVideo/index.jsx'))).digest('hex');
    assert.equal(afterBuild, playerSha256, 'Player source changed during build; rerun against stable source');
    return {
      origin: `http://127.0.0.1:${server.httpServer.address().port}`,
      playerSha256,
      middlewares: server.middlewares,
      scenario(run, settings = {}) { const control = Object.assign(scenario(), settings); scenarios.set(run, control); return control; },
      async close() {
        for (const control of scenarios.values()) release(control);
        await server.close();
        await rm(temporary, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (server) await server.close();
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index].replace(/^--/, '');
    if (!Object.hasOwn(options, key) || !process.argv[index + 1]) throw new Error('Usage: node scripts/test-playback.mjs [--case substring] [--output directory]');
    options[key] = process.argv[index + 1];
  }
  const selected = cases.filter((item) => item.name.includes(options.case));
  assert(selected.length, `No cases match ${JSON.stringify(options.case)}`);
  await mkdir(options.output, { recursive: true });
  const server = await createPlaybackServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--disable-default-apps', '--disable-sync', '--no-sandbox', '--disable-setuid-sandbox'] });
    const results = [];
    for (let index = 0; index < selected.length; index++) results.push(await runCase(browser, server.origin, selected[index], index));
    await writeFile(resolve(options.output, 'results.json'), JSON.stringify({
      browser: await browser.version(), playerSha256: server.playerSha256, results,
    }, null, 2));
    console.log(`${results.filter((item) => item.passed).length}/${results.length} real-media playback cases passed`);
    if (results.some((item) => !item.passed)) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}
if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
