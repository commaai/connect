import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import os from 'node:os';

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE || new URL('./package.json', import.meta.url));
const { chromium, webkit } = require('playwright');
const phase = process.argv[2] || 'baseline';
const trials = Number(process.env.TRIALS || 3);
const engines = (process.env.ENGINES || 'chromium,webkit').split(',');
const deadline = 8000;
const resultsDir = resolve('test-results/playback');
await mkdir(resultsDir, { recursive: true });
const sourceRoot = process.env.BENCH_SOURCE_ROOT;
const benchmarkResolve = { dedupe: ['react', 'react-dom'], alias: sourceRoot ? [{ find: /^\.\.\/\.\.\/src(?=\/)/, replacement: resolve(sourceRoot) }] : [] };
if (!process.env.BENCH_BUILD) await build({ resolve: benchmarkResolve, mode: 'benchmark', build: { outDir: `test-results/playback/build-${phase}`, rollupOptions: { input: resolve('scripts/playback-bench/index.html') } }, logLevel: 'error' });
const suite = process.env.SUITE || 'core';
const cases = process.env.CASES ? process.env.CASES.split(',') : suite === 'extended' ? ['followers', 'paused-map-seek', 'loops', 'minute-seeks', 'gap-seek', 'late-origin', 'source-refresh', 'map-error', 'offline-resume', 'native-pause', 'audio', ...(process.env.NATIVE_HLS ? ['native-hls'] : [])] : ['normal', 'cold-range', 'rapid-seek', 'stall', 'missing-manifest', 'missing-fragment', 'map-continuity', 'route-change', 'speed', 'zero-loop', 'end-loop'];
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.jpg': 'image/jpeg', '.json': 'application/json', '.png': 'image/png' };
let networkFault = null;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const root = path.startsWith('/media/') ? resolve(resultsDir, 'media') : resolve(process.env.BENCH_BUILD || `test-results/playback/build-${phase}`);
  const file = resolve(root, path.startsWith('/media/') ? path.slice(7) : '.' + path);
  if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
  try {
    if (path.startsWith('/media/') && networkFault) {
      networkFault.requests += 1;
      if (networkFault.enabled && networkFault.name === 'map-error' && req.url.includes('map-failure')) { networkFault.missing += 1; res.writeHead(404).end('Injected Map manifest failure'); return; }
      if (networkFault.enabled && ((networkFault.name === 'missing-manifest' && path.endsWith('.m3u8')) || (networkFault.name === 'missing-fragment' && path.endsWith('segment-00.ts')))) {
        networkFault.missing += 1; res.writeHead(404).end('Injected missing media'); return;
      }
      if (networkFault.enabled && networkFault.name === 'stall' && /segment-(0[4-9]|[12][0-9])\.ts$/.test(path)) { networkFault.delayed += 1; await new Promise(resolve => setTimeout(resolve, 1500)); }
    }
    const body = await readFile(file);
    const headers = { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    if (start > end || start >= body.length) { res.writeHead(416, { 'Content-Range': `bytes */${body.length}` }).end(); return; }
    headers['Content-Length'] = end - start + 1;
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${body.length}`;
    res.writeHead(range ? 206 : 200, headers).end(req.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
  }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const hlsScript = await readFile(new URL('../../node_modules/hls.js/dist/hls.min.js', import.meta.url), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function evaluate(page, expression, argument, timeout) {
  let timer;
  try {
    return await Promise.race([page.evaluate(expression, argument), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Renderer evaluation timed out')), timeout); })]);
  } finally { clearTimeout(timer); }
}
async function wait(page, expression, timeout = deadline, argument) {
  const began = Date.now();
  while (Date.now() - began < timeout) {
    if (await evaluate(page, expression, argument, timeout)) return Date.now() - began;
    await sleep(25);
  }
  return null;
}
const fixtureFiles = await readdir(resolve(resultsDir, 'media'), { recursive: true });
const fixtureHashes = {};
for (const file of fixtureFiles.filter(file => /\.(ts|m3u8|jpg|rgb)$/.test(file)).sort()) fixtureHashes[file] = createHash('sha256').update(await readFile(resolve(resultsDir, 'media', file))).digest('hex');
const sourceFiles = (await readdir(resolve(sourceRoot || 'src'), { recursive: true })).filter(file => /\.(js|jsx|css)$/.test(file)).sort();
const sourceTree = createHash('sha256');
for (const file of sourceFiles) sourceTree.update(file).update('\0').update(await readFile(resolve(sourceRoot || 'src', file))).update('\0');
const output = { phase, sourceTreeSha256: sourceTree.digest('hex'), suite, fixtureHashes, environment: { node: process.version, playwright: require('playwright/package.json').version, headless: process.env.HEADLESS !== '0', os: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, nativeHlsRequested: Boolean(process.env.NATIVE_HLS) }, capturedAt: new Date().toISOString(), baselineCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceRoot: sourceRoot ? 'archived baseline with test-only class exports' : 'working source',
  sourceSha256: process.env.BENCH_SOURCE_SHA || createHash('sha256').update(execFileSync('git', ['diff', 'HEAD', '--', 'src', 'package.json', 'bun.lock'])).digest('hex'),
  harnessSha256: createHash('sha256').update(await readFile('scripts/playback-bench/harness.jsx')).digest('hex'),
  runnerSha256: createHash('sha256').update(await readFile('scripts/playback-bench/run.mjs')).digest('hex'),
  fixtureSha256: createHash('sha256').update(await readFile(resolve(resultsDir, 'media/segment-00.ts'))).digest('hex'),
  protocol: { suite, cases, trials, deadlineMs: deadline, cache: 'new context per scenario, no-store media', viewport: [1280, 800], media: '60s 320x180 30fps H.264 + AAC, 2s HLS fragments', network: 'local; explicit 404/stall only', scope: 'real Media, Timeline, TimeDisplay; blank local map style; no physical phones/audio listening' }, runs: [] };

try {
  for (const engine of engines) {
    let browser;
    try { browser = await ({ chromium, webkit }[engine]).launch({ headless: process.env.HEADLESS !== '0', args: engine === 'chromium' ? ['--autoplay-policy=no-user-gesture-required'] : [] }); }
    catch (error) { output.runs.push({ engine, unavailable: error.message }); continue; }
    for (let trial = 1; trial <= trials; trial++) {
      const run = { engine, browserVersion: browser.version(), trial, scenarios: [] };
      for (const name of cases) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...(process.env.NATIVE_HLS ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' } : {}) });
        let fault = name.startsWith('missing') || name === 'stall';
        let requests = 0, bytes = 0;
        networkFault = { name, enabled: fault, requests: 0, missing: 0, delayed: 0 };
        await context.route('**/*', async route => {
          const url = route.request().url();
          if (url.startsWith(origin)) {
            if (url.includes('/media/')) {
              requests++;
            }
            await route.continue(); return;
          }
          if (url.includes('hls.js')) { await route.fulfill({ contentType: 'application/javascript', body: hlsScript }); return; }
          if (url.includes('mapbox') && url.includes('/styles/')) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 8, sources: {}, layers: [] }) }); return; }
          await route.abort();
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('response', async r => { if (r.url().includes('/media/')) bytes += Number(r.headers()['content-length'] || 0); });
        await page.addInitScript(() => {
          window.__frames = { first: null, last: null, time: null, count: 0 };
          const seen = new WeakSet();
          new MutationObserver(() => document.querySelectorAll('video').forEach(video => {
            if (seen.has(video)) return; seen.add(video);
            const frame = (_, metadata) => { const f = window.__frames; f.first ??= performance.now(); f.last = performance.now(); f.time = metadata.mediaTime; f.count++; video.requestVideoFrameCallback(frame); };
            if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(frame);
          })).observe(document, { childList: true, subtree: true });
        });
        const result = { name, status: 'pass', metrics: {} };
        try {
          await page.goto(`${origin}/scripts/playback-bench/index.html?start=${name === 'cold-range' ? 20 : 0}${suite === 'extended' ? `&details=1&duration=180&media=/media/minute/${name === 'gap-seek' ? 'gap' : 'stream'}.m3u8` : ''}`, { waitUntil: 'load' });
          await page.waitForFunction(() => window.__bench, { timeout: deadline });
          if (name.startsWith('missing')) {
            const errorMs = await wait(page, () => window.__bench.sample().errorVisible);
            result.metrics.errorMs = errorMs;
            result.metrics.errorState = await page.evaluate(() => window.__bench.sample());
            fault = false; networkFault.enabled = false;
            const retry = page.getByRole('button', { name: 'Retry', exact: true });
            if (!await retry.count()) throw new Error('No Retry control after injected 404');
            const frameCount = await page.evaluate(() => window.__frames.count);
            const began = Date.now(); await retry.click();
            const recovery = await wait(page, before => window.__frames.count >= before + 3 && !window.__bench.sample().errorVisible && !window.__bench.sample().buffering, deadline, frameCount);
            result.metrics.recoveryMs = recovery === null ? null : Date.now() - began;
            if (recovery === null || errorMs === null) throw new Error('Error/recovery deadline exceeded');
          } else {
            const first = await wait(page, () => window.__frames.count > 2);
            result.metrics.firstFrameMs = await page.evaluate(() => window.__frames.first === null ? null : window.__frames.first - window.__bench.started);
            if (first === null) throw new Error('No decoded frames before deadline');
            if (suite === 'extended') {
              await runExtended(page, context, name, result);
            } else if (name === 'normal') {
              const profiler = engine === 'chromium' ? await context.newCDPSession(page) : null;
              if (profiler) await profiler.send('Performance.enable');
              const cpuBefore = profiler ? await profiler.send('Performance.getMetrics') : null;
              await page.evaluate(() => { window.__storeNotifications = 0; window.__bench.store.subscribe(() => window.__storeNotifications++); });
              const samples = [];
              for (let i = 0; i < 30; i++) { samples.push(await page.evaluate(() => ({ ...window.__bench.sample(), frameTime: window.__frames.time }))); await sleep(50); }
              result.metrics.samples = samples;
              result.metrics.storeNotifications = await page.evaluate(() => window.__storeNotifications);
              if (profiler) {
                const after = await profiler.send('Performance.getMetrics');
                const value = (r, key) => r.metrics.find(m => m.name === key)?.value;
                result.metrics.mainThreadTaskMs = (value(after, 'TaskDuration') - value(cpuBefore, 'TaskDuration')) * 1000;
                result.metrics.sampleWindowMs = samples.at(-1).now - samples[0].now;
                result.metrics.jsHeapBytes = value(after, 'JSHeapUsedSize');
              }
              result.metrics.maxClockErrorMs = Math.max(...samples.map(s => Math.abs(s.appSeconds - s.frameTime) * 1000));
              result.metrics.maxRateDeviation = Math.max(...samples.map(s => Math.abs(s.rate - 1)));
              await page.evaluate(() => window.__bench.pause()); await sleep(200);
              const before = await page.evaluate(() => window.__bench.sample()); await sleep(500);
              const after = await page.evaluate(() => window.__bench.sample());
              result.metrics.pauseDriftMs = Math.abs(after.appSeconds - before.appSeconds) * 1000;
              result.metrics.droppedFrames = after.droppedFrames;
              const seeks = [];
              for (const target of [10, 45, 15]) {
                const began = Date.now(); await page.evaluate(t => window.__bench.seek(t), target);
                const settled = await wait(page, target => { const v = document.querySelector('video'); return v && !v.seeking && Math.abs(v.currentTime - target) < .15 && Math.abs(window.__frames.time - target) < .15; }, deadline, target);
                seeks.push({ target, latencyMs: settled === null ? null : Date.now() - began, reached: await page.evaluate(() => window.__frames.time) });
              }
              result.metrics.seeks = seeks;
              if (seeks.some(s => s.latencyMs === null || Math.abs(s.reached - s.target) > .15)) throw new Error('Paused seek failed');
            } else if (name === 'cold-range') {
              const sample = await page.evaluate(() => ({ ...window.__bench.sample(), frameTime: window.__frames.time })); result.metrics.arrival = sample;
              if (Math.abs(sample.frameTime - 20) > 1) throw new Error('Cold range started at wrong position');
            } else if (name === 'rapid-seek') {
              await page.evaluate(() => { window.__bench.pause(); [5, 50, 12, 35, 25].forEach(t => window.__bench.seek(t)); });
              const began = Date.now();
              const arrival = await wait(page, () => Math.abs(window.__frames.time - 25) < .15);
              result.metrics.latestSeekMs = arrival === null ? null : Date.now() - began;
              result.metrics.finalFrameTime = await page.evaluate(() => window.__frames.time);
              if (arrival === null) throw new Error('Latest seek did not win');
            } else if (name === 'stall') {
              await page.evaluate(() => window.__bench.seek(50)); await sleep(400);
              result.metrics.stalled = await page.evaluate(() => ({ ...window.__bench.sample(), frameTime: window.__frames.time }));
              fault = false; networkFault.enabled = false;
              const arrived = await wait(page, () => window.__frames.time >= 50);
              result.metrics.arrivalAfterReleaseMs = arrived;
              if (arrived === null) throw new Error('Delayed fragment did not resume');
            } else if (name === 'map-continuity') {
              const before = await page.evaluate(() => { window.__originalVideo = document.querySelector('video'); return window.__bench.sample(); });
              await page.getByText('Map', { exact: true }).first().click(); await sleep(600);
              result.metrics.afterSwitch = await page.evaluate(() => ({ ...window.__bench.sample(), sameElement: document.querySelector('video') === window.__originalVideo }));
              const after = result.metrics.afterSwitch;
              if (!after.sameElement || after.videoSeconds <= before.videoSeconds) throw new Error('Map unmounted or stopped video');
            } else if (name === 'speed') {
              const rates = [];
              for (const rate of [.5, 2, 4]) {
                await page.evaluate(r => window.__bench.play(r), rate); await sleep(600);
                rates.push({ requested: rate, ...await page.evaluate(() => window.__bench.sample()) });
              }
              result.metrics.rates = rates;
              if (rates.some(r => Math.abs(r.rate - r.requested) > .01)) throw new Error('Playback rate differs from requested speed');
            } else if (name === 'zero-loop' || name === 'end-loop') {
              await page.evaluate(name => { window.__bench.loop(name === 'zero-loop' ? 0 : 58, name === 'zero-loop' ? 2 : 60); window.__bench.seek(name === 'zero-loop' ? 1.8 : 59.8); window.__bench.play(); }, name);
              await sleep(1500);
              result.metrics.afterLoop = await page.evaluate(() => ({ ...window.__bench.sample(), frameTime: window.__frames.time }));
              const s = result.metrics.afterLoop;
              if (s.paused || (name === 'zero-loop' ? s.frameTime >= 2 : s.frameTime < 58 || s.frameTime >= 60)) throw new Error('Selected loop did not wrap and continue');
            } else if (name === 'route-change') {
              const before = await page.evaluate(() => { window.__frames.count = 0; return document.querySelector('video')?.currentSrc; });
              await page.evaluate(() => window.__bench.switchRoute());
              const arrival = await wait(page, () => { const s = window.__bench.sample(); return s.videoSeconds < 1 && window.__frames.count > 2; });
              result.metrics.newRouteMs = arrival;
              result.metrics.previousSource = before;
              if (arrival === null) throw new Error('New route did not start');
            }
          }
        } catch (e) { result.status = 'fail'; result.failure = e.message; try { result.metrics.failureState = await evaluate(page, () => ({ ...window.__bench.sample(), frameTime: window.__frames.time }), undefined, 1000); } catch {}
          try { const frame = await evaluate(page, () => { const c = document.createElement('canvas'); c.width=320; c.height=180; c.getContext('2d').drawImage(document.querySelector('video'),0,0,320,180); return c.toDataURL('image/png'); }, undefined, 1000); await writeFile(resolve(resultsDir, `${phase}-${engine}-${name}.png`), Buffer.from(frame.split(',')[1], 'base64')); } catch {}
        }
        result.serverFault = { ...networkFault };
        result.requests = requests; result.responseBytes = bytes; result.pageErrors = errors;
        if (errors.length) { result.status = 'fail'; result.failure = 'Runtime page errors: ' + errors.join('; '); }
        run.scenarios.push(result);
        console.log(JSON.stringify({ phase, engine, trial, name, status: result.status, metrics: { ...result.metrics, samples: undefined }, failure: result.failure }));
        await context.close();
      }
      output.runs.push(run);
      await writeFile(resolve(resultsDir, `${phase}.json`), JSON.stringify(output, null, 2));
    }
    await browser.close();
  }
} finally { server.close(); }
await writeFile(resolve(resultsDir, `${phase}.json`), JSON.stringify(output, null, 2));
console.log(`Saved ${resultsDir}/${phase}.json`);

process.exitCode = output.runs.some(r => r.unavailable || r.scenarios?.some(s => s.status !== 'pass')) ? 1 : 0;

async function runExtended(page, context, name, result) {
  const sample = () => page.evaluate(() => ({ ...window.__bench.sample(), frameTime: window.__frames.time }));
  const seekTo = async (target, minimum = target - .2) => {
    const framesBefore = await page.evaluate(() => document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames);
    await page.evaluate(t => window.__bench.seek(t), target);
    const reached = await wait(page, ({ min, frames, native }) => { const v = document.querySelector('video'); const s = window.__bench.sample(); return !v.seeking && v.readyState >= 2 && s.appSeconds >= min && !s.buffering && (getComputedStyle(v.parentElement).display === 'none' || (native || Math.abs(window.__frames.time - v.currentTime) < .2)); }, deadline, { min: minimum, frames: framesBefore, native: Boolean(process.env.NATIVE_HLS) });
    if (reached === null) throw new Error(`Seek to ${target}s never settled`);
    const state = await sample();
    if ((process.env.NATIVE_HLS && state.paused && name !== 'paused-map-seek') || name === 'gap-seek') state.frameEvidence = await verifyFrame(page, target === 85 ? 120 : target);
    return state;
  };
  if (name === 'followers') {
    await page.getByText('Map', { exact: true }).first().click();
    const marker = await wait(page, () => window.__marker?.coordinates.length === 2 && Number.isFinite(window.__timelinePosition));
    if (marker === null) throw new Error('Actual marker/timeline output unavailable');
    await seekTo(30);
    const resume = await wait(page, () => !document.querySelector('video').paused, 1000);
    if (resume === null) throw new Error('Playing seek did not resume in Map');
    const catchup = await wait(page, () => {
      const s = window.__bench.sample();
      return s.map && Math.abs((s.map.coordinates[0] + 117.161052) / .0001 - s.appSeconds) < .15 && Math.abs(s.timeline / 100 * 180 - s.appSeconds) < .15;
    }, 1000);
    result.metrics.followersCatchupMs = catchup;
    if (catchup === null || catchup > 150) throw new Error('Followers did not catch up within 150 ms of seek completion');
    const samples = [];
    for (let i = 0; i < 20; i++) { samples.push(await sample()); await sleep(50); }
    result.metrics.samples = samples;
    result.metrics.maxMarkerErrorMs = Math.max(...samples.map(s => Math.abs((s.map.coordinates[0] + 117.161052) / .0001 - s.appSeconds) * 1000));
    result.metrics.maxTimelineErrorMs = Math.max(...samples.map(s => Math.abs(s.timeline / 100 * 180 - s.appSeconds) * 1000));
    if (result.metrics.maxMarkerErrorMs > 150 || result.metrics.maxTimelineErrorMs > 150) throw new Error('Follower render alignment exceeds 150 ms');
    const images = await page.locator('.thumbnailImage.images').count();
    result.metrics.thumbnailImages = images;
    if (!images) throw new Error('No real thumbnail entries rendered');
  } else if (name === 'paused-map-seek') {
    await page.getByText('Map', { exact: true }).first().click();
    await page.evaluate(() => window.__bench.pause());
    await seekTo(45);
    await page.getByText('Video', { exact: true }).first().click();
    result.metrics.frameEvidence = await verifyFrame(page, 45);
    result.metrics.returned = await sample();
    if (!result.metrics.returned.paused || await page.evaluate(() => window.__bench.store.getState().desiredPlaySpeed) !== 0) throw new Error('Returning to Video lost paused intent');
  } else if (name === 'loops') {
    result.metrics.loops = [];
    for (const [start, end] of [[0, 2], [178, 180]]) {
      await page.evaluate(([start, end]) => { window.__bench.loop(start, end); window.__bench.seek(end - .2); window.__bench.play(); }, [start, end]);
      const arrived = await wait(page, end => { const s = window.__bench.sample(); return s.videoSeconds >= end - .3 && !s.buffering; }, deadline, end);
      if (arrived === null) throw new Error('Loop end seek did not settle');
      const wrapped = await wait(page, ([start, end]) => { const s = window.__bench.sample(); return !s.paused && !s.buffering && s.appSeconds >= start - .15 && s.appSeconds < end - .3 && s.videoSeconds >= start - .15 && s.videoSeconds < end - .3; }, deadline, [start, end]);
      const s = await sample(); result.metrics.loops.push({ start, end, wrapMs: wrapped, ...s });
      if (wrapped === null) throw new Error('Selected loop did not wrap and continue');
    }
  } else if (name === 'minute-seeks') {
    await page.evaluate(() => window.__bench.pause());
    result.metrics.arrivals = [];
    for (const target of [59.8, 60.1, 119.8, 120.1, 179.5]) {
      const began = Date.now(); const s = await seekTo(target);
      result.metrics.arrivals.push({ target, latencyMs: Date.now() - began, ...s });
      if (Math.abs(s.videoSeconds - target) > .2 || Math.abs(s.appSeconds - target) > .2) throw new Error('Minute-boundary seek landed at wrong position');
    }
  } else if (name === 'gap-seek') {
    await page.evaluate(() => window.__bench.pause());
    await seekTo(85, 119.8);
    const mapped = await wait(page, () => window.__bench.sample().appSeconds >= 119.8 && (!window.__playlist || window.__frames.time + .000001 >= (window.__playlist[1].elementaryStreams?.video?.startPTS ?? window.__playlist[1].start)));
    result.metrics.arrival = await sample();
    if (mapped === null) throw new Error('Gap seek never displayed the available route segment');
    // A browser may skip unavailable timestamps. The UI must reflect where it
    // actually decoded and must not keep seeking forever to an absent frame.
    const s = result.metrics.arrival;
    if (s.appSeconds < 119.8 || s.appSeconds > 120.5 || s.buffering) throw new Error('Timestamp-gap landing is not reflected by the viewer');
    result.metrics.laterArrivals = [];
    for (const target of [130, 150, 179.5]) {
      const arrival = await seekTo(target); result.metrics.laterArrivals.push({ target, ...arrival });
      if (Math.abs(arrival.appSeconds - target) > .2) throw new Error('Route mapping drifted after the missing minute');
    }
  } else if (name === 'late-origin') {
    const before = await sample();
    await page.evaluate(() => { window.__sourceBefore = document.querySelector('video').currentSrc; window.__bench.updateRoute({ videoStartOffset: 500 }); });
    await sleep(200);
    const after = await sample(); result.metrics.before = before; result.metrics.after = after;
    const sameSource = await page.evaluate(() => window.__sourceBefore === document.querySelector('video').currentSrc);
    if (!sameSource || Math.abs(after.appSeconds - after.frameTime - .5) > .05) throw new Error('Late camera origin reloaded or misaligned the stream');
  } else if (name === 'source-refresh') {
    await page.evaluate(() => window.__bench.pause()); await seekTo(45);
    await page.evaluate(() => { window.__sourceBefore = document.querySelector('video').currentSrc; window.__bench.updateRoute({ share_sig: 'refreshed' }); });
    const resumed = await wait(page, () => { const v = document.querySelector('video'); return v.currentSrc !== window.__sourceBefore && !v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - 45) < .2 && !window.__bench.sample().buffering; });
    result.metrics.restored = await sample();
    if (resumed === null) throw new Error('Source refresh lost paused position');
  } else if (name === 'map-error') {
    await page.getByText('Map', { exact: true }).first().click();
    networkFault.enabled = true;
    await page.evaluate(() => window.__bench.updateRoute({ share_sig: 'map-failure' }));
    await page.getByRole('button', { name: 'Retry', exact: true }).waitFor({ timeout: deadline });
    networkFault.enabled = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    const recovered = await wait(page, () => { const s = window.__bench.sample(); return !s.errorVisible && !s.buffering && !s.paused; });
    result.metrics.recovered = await sample();
    if (recovered === null) throw new Error('Map recovery did not clear error and resume');
  } else if (name === 'offline-resume') {
    const cached = await page.evaluate(() => window.__bench.sample().buffered.some(([start, end]) => start <= 150 && end >= 150));
    result.metrics.offlineTargetWasBuffered = cached;
    await context.setOffline(true);
    await page.evaluate(() => window.__bench.seek(150)); await sleep(700);
    const before = await sample(); await sleep(500); const after = await sample();
    result.metrics.offlineDriftMs = Math.abs(after.appSeconds - before.appSeconds) * 1000;
    await context.setOffline(false);
    if (await page.getByRole('button', { name: 'Retry', exact: true }).count()) await page.getByRole('button', { name: 'Retry', exact: true }).click();
    const resumed = await wait(page, () => { const s = window.__bench.sample(); return s.videoSeconds >= 150 && !s.buffering && !s.errorVisible; }, 15000);
    result.metrics.resumed = await sample();
    if ((!cached && result.metrics.offlineDriftMs > 40) || resumed === null) throw new Error('Offline seek did not freeze/recover');
  } else if (name === 'native-pause') {
    await page.evaluate(() => document.querySelector('video').pause()); await sleep(200);
    const before = await sample(); await sleep(500); const after = await sample();
    result.metrics.pauseDriftMs = Math.abs(after.appSeconds - before.appSeconds) * 1000;
    const intent = await page.evaluate(() => window.__bench.store.getState().desiredPlaySpeed);
    await page.evaluate(() => document.querySelector('video').play()); await sleep(300);
    const resumed = await sample(); result.metrics.resumed = resumed;
    if (intent !== 0 || !before.paused || resumed.paused || result.metrics.pauseDriftMs > 40) throw new Error('Native pause/play intent or timing mismatch');
  } else if (name === 'audio') {
    const unmute = page.getByRole('button', { name: 'Unmute', exact: true });
    await wait(page, () => !document.querySelector('button[aria-label=Unmute]')?.disabled);
    await unmute.click(); await sleep(300);
    result.metrics.unmuted = await sample();
    await page.getByRole('button', { name: 'Mute', exact: true }).click(); await sleep(200);
    result.metrics.remuted = await sample();
    if (result.metrics.unmuted.muted || !result.metrics.remuted.muted || result.metrics.remuted.paused) throw new Error('Audio controls failed');
  } else if (name === 'native-hls') {
    result.metrics.seekEvidence = 'Native paused seeks: seeked, readyState and canvas pixels compared with FFmpeg-decoded reference frames; this WebKit build does not emit paused-seek rVFC callbacks.';
    result.metrics.nativeSource = await page.evaluate(() => document.querySelector('video').currentSrc);
    result.metrics.playback = await sample();
    if (!result.metrics.nativeSource.includes('.m3u8')) throw new Error('This environment did not exercise native HLS');
  }
}

async function verifyFrame(page, target) {
  const reference = await readFile(resolve(resultsDir, `media/golden/${target}.rgb`));
  const pixels = [];
  for (let i = 0; i < 320 * 180; i += 16) pixels.push(reference[i * 3], reference[i * 3 + 1], reference[i * 3 + 2]);
  const began = Date.now();
  let error;
  while (Date.now() - began < deadline) {
    error = await evaluate(page, reference => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const context = canvas.getContext('2d'); context.drawImage(document.querySelector('video'), 0, 0, 320, 180);
      const actual = context.getImageData(0, 0, 320, 180).data;
      let difference = 0, n = 0;
      for (let i = 0; i < 320 * 180; i += 16) for (let c = 0; c < 3; c++) difference += Math.abs(actual[i * 4 + c] - reference[n++]);
      return difference / n;
    }, pixels, deadline);
    if (error <= 12) return { target, meanRgbError: error, threshold: 12, samples: pixels.length, latencyMs: Date.now() - began };
    await sleep(50);
  }
  throw new Error(`Decoded image does not match ${target}s reference (RGB error ${error})`);
}
