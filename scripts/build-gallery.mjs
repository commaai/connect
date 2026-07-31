/* eslint-disable no-await-in-loop -- captures are intentionally serialized in one browser */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import {
  dirname, extname, resolve, sep,
} from 'node:path';
import { promisify } from 'node:util';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import puppeteer from 'puppeteer';
import { build } from 'vite';

const ROUTE_NAME = '5beb9b58bd12b691|0000010a--a51155e496';
const FIXED_TIME = '2026-02-25T18:00:00-08:00';
const LOCALE = 'en-US';
const TIMEZONE = 'America/Los_Angeles';
const CHANGE_THRESHOLD = 0.0001;
const GALLERY_VERSION = 2;

const GALLERY_STATES = [
  { name: 'signin', label: 'Sign in' },
  { name: 'pair', label: 'Pair a device' },
  { name: 'dashboard', label: 'Dashboard' },
  { name: 'drive', label: 'Drive' },
  { name: 'checkout', label: 'Prime checkout' },
  { name: 'management', label: 'Prime management' },
  { name: 'teleop', label: 'Teleop' },
  {
    name: 'pair-device-modal',
    label: 'Pair device modal',
    page: 'pair',
    actions: [{ text: 'add new device' }],
    modalText: 'Pair device',
  },
  {
    name: 'date-filter-modal',
    label: 'Date filter modal',
    page: 'dashboard',
    actions: [{ text: 'Filter' }],
    modalText: 'Start date:',
  },
  {
    name: 'device-settings-modal',
    label: 'Device settings modal',
    page: 'dashboard',
    actions: [
      { selector: '[aria-label="menu"]', optional: true },
      { selector: '[aria-label="device settings"]' },
    ],
    modalText: 'Device settings',
  },
  {
    name: 'unpair-device-modal',
    label: 'Unpair device modal',
    page: 'dashboard',
    actions: [
      { selector: '[aria-label="menu"]', optional: true },
      { selector: '[aria-label="device settings"]' },
      { text: 'Unpair' },
    ],
    modalText: 'Unpair device',
  },
  {
    name: 'upload-queue-modal',
    label: 'Upload queue modal',
    page: 'dashboard',
    actions: [
      { selector: '[aria-label="menu"]', optional: true },
      { selector: '[aria-label="device settings"]' },
      { text: 'Uploads' },
    ],
    modalText: 'Upload queue',
  },
  {
    name: 'switch-prime-plan-modal',
    label: 'Switch prime plan modal',
    page: 'management',
    actions: [{ text: 'Switch to Lite plan' }],
    modalText: 'Confirm switch',
  },
  {
    name: 'cancel-prime-modal',
    label: 'Cancel prime modal',
    page: 'management',
    actions: [{ text: 'Cancel subscription' }],
    modalText: 'Cancel prime subscription',
  },
  {
    name: 'pairing-status-modal',
    label: 'Pairing status modal',
    page: 'dashboard',
    pairToken: 'eyJhbGciOiJub25lIn0.eyJpZGVudGl0eSI6ImdhbGxlcnkifQ.',
    modalText: 'Pairing device',
  },
];

const GALLERY_VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const execute = promisify(execFile);

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const [name, inlineValue] = arg.slice(2).split('=', 2);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    values[name] = value;
  }
  return values;
}

function captureFilename(state, viewport) {
  return `${state}-${viewport}.png`;
}

async function gitSha(directory) {
  try {
    return (await execute('git', ['rev-parse', 'HEAD'], { cwd: directory })).stdout.trim();
  } catch {
    return 'local';
  }
}

async function getResponse(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response;
}

async function fetchFixtures(output) {
  const routeUrl = `https://api.commadotai.com/v1/route/${encodeURIComponent(ROUTE_NAME)}/`;
  const route = await (await getResponse(routeUrl)).json();
  const assetRoot = new URL(route.url);
  if (assetRoot.protocol !== 'https:') throw new Error(`Expected an HTTPS route asset URL, got ${route.url}`);
  const assetRootUrl = assetRoot.href.replace(/\/$/, '');
  const segmentEvents = await Promise.all(
    Array.from({ length: route.maxqlog + 1 }, async (_, segment) => (
      (await getResponse(`${assetRootUrl}/${segment}/events.json`)).json()
    )),
  );
  const sprite = await getResponse(`${assetRootUrl}/0/sprite.jpg`);
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(resolve(output, 'events.json'), `${JSON.stringify(segmentEvents.flat())}\n`),
    writeFile(resolve(output, 'sprite.jpg'), Buffer.from(await sprite.arrayBuffer())),
  ]);
}

async function optionalFile(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function buildRenderer(source, fixtures, output) {
  const generatedEvents = resolve(source, 'src/gallery-fixtures/events.generated.json');
  const generatedSprite = resolve(
    source,
    'src/gallery-fixtures/5beb9b58bd12b691/0000010a--a51155e496/0/sprite.jpg',
  );
  const backups = await Promise.all([optionalFile(generatedEvents), optionalFile(generatedSprite)]);
  await Promise.all([mkdir(dirname(generatedEvents), { recursive: true }), mkdir(dirname(generatedSprite), { recursive: true })]);
  await Promise.all([
    copyFile(resolve(fixtures, 'events.json'), generatedEvents),
    copyFile(resolve(fixtures, 'sprite.jpg'), generatedSprite),
  ]);
  try {
    await build({
      root: source,
      mode: 'gallery',
      base: './',
      build: {
        outDir: output,
        emptyOutDir: true,
        sourcemap: false,
        cssCodeSplit: false,
        assetsInlineLimit: 100000000,
        rollupOptions: {
          input: resolve(source, 'connect-gallery.html'),
          output: { inlineDynamicImports: true },
        },
      },
    });
  } finally {
    await Promise.all([
      backups[0] === null ? rm(generatedEvents, { force: true }) : writeFile(generatedEvents, backups[0]),
      backups[1] === null ? rm(generatedSprite, { force: true }) : writeFile(generatedSprite, backups[1]),
    ]);
  }
}

function serveDirectory(directory) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const relative = decodeURIComponent(url.pathname === '/' ? '/connect-gallery.html' : url.pathname);
      const path = resolve(directory, `.${relative}`);
      if (path !== directory && !path.startsWith(`${directory}${sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const details = await stat(path);
      if (!details.isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': details.size,
        'Content-Type': MIME_TYPES[extname(path)] ?? 'application/octet-stream',
      });
      createReadStream(path).pipe(response);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
    }
  });
  return new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      accept({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done, fail) => server.close((error) => (error ? fail(error) : done()))),
      });
    });
  });
}

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assertNotBlank(buffer, name) {
  const png = PNG.sync.read(buffer);
  const first = [png.data[0], png.data[1], png.data[2], png.data[3]];
  for (let offset = 4; offset < png.data.length; offset += 4) {
    if (
      png.data[offset] !== first[0]
      || png.data[offset + 1] !== first[1]
      || png.data[offset + 2] !== first[2]
      || png.data[offset + 3] !== first[3]
    ) return;
  }
  throw new Error(`${name} rendered as a single-color blank image`);
}

async function waitForStableFrames(page, label) {
  let previous;
  let consecutive = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((accept) => setTimeout(accept, 100));
    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    const current = digest(buffer);
    if (current === previous) consecutive += 1;
    else consecutive = 0;
    if (consecutive >= 2) return buffer;
    previous = current;
  }
  throw new Error(`${label} did not reach three consecutive stable frames`);
}

async function setStoredPairToken(page, origin, pairToken) {
  await page.goto(`${origin}/__gallery-storage`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(async (token) => {
    const database = await new Promise((accept, reject) => {
      const request = indexedDB.open('localforage');
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('keyvaluepairs')) db.createObjectStore('keyvaluepairs');
        if (!db.objectStoreNames.contains('local-forage-detect-blob-support')) {
          db.createObjectStore('local-forage-detect-blob-support');
        }
      };
      request.onsuccess = () => accept(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((accept, reject) => {
      const transaction = database.transaction('keyvaluepairs', 'readwrite');
      transaction.objectStore('keyvaluepairs').put(token, 'pairToken');
      transaction.oncomplete = accept;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, pairToken);
}

async function clickGalleryAction(page, action, label) {
  const description = action.selector ?? JSON.stringify(action.text);
  const target = { selector: action.selector, targetText: action.text };
  const click = (details) => {
    const visible = (element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const element = details.selector
      ? document.querySelector(details.selector)
      : Array.from(document.querySelectorAll('button, [role="button"], [role="menuitem"], [aria-haspopup="true"]'))
        .find((candidate) => candidate.textContent.trim() === details.targetText && visible(candidate));
    if (!element || !visible(element)) return false;
    element.click();
    return true;
  };
  if (action.optional) {
    if (!await page.evaluate(click, target)) return;
  } else {
    await page.waitForFunction((details) => {
      const visible = (element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const element = details.selector
        ? document.querySelector(details.selector)
        : Array.from(document.querySelectorAll('button, [role="button"], [role="menuitem"], [aria-haspopup="true"]'))
          .find((candidate) => candidate.textContent.trim() === details.targetText && visible(candidate));
      return Boolean(element && visible(element));
    }, { timeout: 5000 }, target).catch(async (error) => {
      const available = await page.evaluate(() => Array.from(
        document.querySelectorAll('button, [role="button"], [role="menuitem"], [aria-haspopup="true"]'),
        (element) => element.textContent.trim(),
      ).filter(Boolean));
      throw new Error(`${label}: action target ${description} was not visible; available actions: ${available.join(', ')}`, { cause: error });
    });
    if (!await page.evaluate(click, target)) {
      throw new Error(`${label}: action target ${description} disappeared before it could be clicked`);
    }
  }
  await page.evaluate(() => new Promise((accept) => requestAnimationFrame(() => requestAnimationFrame(accept))));
  if (page.isClosed()) throw new Error(`${label}: action ${description} closed the page`);
}

async function openGalleryModal(page, state, label) {
  for (const action of state.actions ?? []) await clickGalleryAction(page, action, label);
  if (!state.modalText) return;
  await page.waitForFunction((expected) => {
    const visible = (element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    return Array.from(document.querySelectorAll('[role="document"]'))
      .some((element) => visible(element) && element.textContent.includes(expected));
  }, { timeout: 5000 }, state.modalText).catch((error) => {
    throw new Error(`${label}: modal containing ${JSON.stringify(state.modalText)} did not open`, { cause: error });
  });
}

async function captureOne(browser, origin, outputPath, state, viewport) {
  const page = await browser.newPage();
  const failures = [];
  try {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await page.emulateTimezone(TIMEZONE);
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await page.evaluateOnNewDocument((timestamp) => {
      const NativeDate = Date;
      class FrozenDate extends NativeDate {
        constructor(...args) { super(...(args.length === 0 ? [timestamp] : args)); }
        static now() { return timestamp; }
      }
      Object.setPrototypeOf(FrozenDate, NativeDate);
      globalThis.Date = FrozenDate;
    }, Date.parse(FIXED_TIME));
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (['data:', 'blob:'].includes(url.protocol) || url.hostname === '127.0.0.1') request.continue();
      else request.abort('blockedbyclient');
    });
    if (state.pairToken) await setStoredPairToken(page, origin, state.pairToken);
    page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));
    page.on('requestfailed', (request) => {
      const url = new URL(request.url());
      if (url.hostname === '127.0.0.1') failures.push(`local asset failed: ${request.url()} (${request.failure()?.errorText})`);
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.hostname === '127.0.0.1' && response.status() >= 400) {
        failures.push(`local asset returned ${response.status()}: ${response.url()}`);
      }
    });

    const pageName = state.page ?? state.name;
    await page.goto(`${origin}/connect-gallery.html?gallery=${encodeURIComponent(pageName)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForFunction(
      (expected) => document.documentElement.dataset.galleryReady === expected,
      { timeout: 15000 },
      pageName,
    );
    await page.evaluate(async () => {
      if (document.fonts) await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => {
        if (image.complete && image.naturalWidth > 0) return undefined;
        if (typeof image.decode === 'function') return image.decode();
        return new Promise((accept, reject) => {
          image.addEventListener('load', accept, { once: true });
          image.addEventListener('error', reject, { once: true });
        });
      }));
      const root = document.getElementById('root');
      if (!root || !root.firstElementChild || root.getBoundingClientRect().width < 1 || root.getBoundingClientRect().height < 1) {
        throw new Error('Gallery root is missing or blank');
      }
    });
    await page.addStyleTag({ content: `
      *, *::before, *::after {
        animation: none !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        transition: none !important;
      }
    ` });
    const label = `${state.name}/${viewport.name}`;
    await openGalleryModal(page, state, label);
    const buffer = await waitForStableFrames(page, label);
    if (failures.length) throw new Error(`${label}: ${failures.join('; ')}`);
    assertNotBlank(buffer, label);
    await writeFile(outputPath, buffer);
  } finally {
    if (state.pairToken && !page.isClosed()) {
      await page.evaluate(() => new Promise((accept, reject) => {
        const request = indexedDB.open('localforage');
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('keyvaluepairs', 'readwrite');
          transaction.objectStore('keyvaluepairs').delete('pairToken');
          transaction.oncomplete = () => { database.close(); accept(); };
          transaction.onerror = () => reject(transaction.error);
        };
        request.onerror = () => reject(request.error);
      }));
    }
    await page.close();
  }
}

async function captureRenderers(renderers, output) {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const renderer of renderers) {
    const server = await serveDirectory(renderer.directory);
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'shell',
        env: { ...process.env, LANG: `${LOCALE}.UTF-8`, LC_ALL: `${LOCALE}.UTF-8`, TZ: TIMEZONE },
        args: [
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-setuid-sandbox',
          '--disable-sync',
          '--force-color-profile=srgb',
          `--lang=${LOCALE}`,
          '--no-sandbox',
        ],
      });
      const destination = resolve(output, renderer.name);
      await mkdir(destination, { recursive: true });
      for (const state of GALLERY_STATES) {
        for (const viewport of GALLERY_VIEWPORTS) {
          const filename = captureFilename(state.name, viewport.name);
          await captureOne(browser, server.origin, resolve(destination, filename), state, viewport);
          console.log(`Captured ${renderer.name}/${filename}`);
        }
      }
    } finally {
      if (browser) await browser.close();
      await server.close();
    }
  }
}

async function assertCaptureSet(directory, kind) {
  const expected = GALLERY_STATES.flatMap(({ name }) => (
    GALLERY_VIEWPORTS.map(({ name: viewport }) => captureFilename(name, viewport))
  )).sort();
  const actual = (await readdir(directory)).filter((name) => name.endsWith('.png')).sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    throw new Error(`${kind} capture set must contain exactly ${expected.length} expected PNGs; found: ${actual.join(', ')}`);
  }
}

async function compareImages(basePath, currentPath, diffPath) {
  const [baseBuffer, currentBuffer] = await Promise.all([readFile(basePath), readFile(currentPath)]);
  const baseline = PNG.sync.read(baseBuffer);
  const current = PNG.sync.read(currentBuffer);
  if (baseline.width !== current.width || baseline.height !== current.height) {
    throw new Error(`Image dimensions differ: ${baseline.width}x${baseline.height} vs ${current.width}x${current.height}`);
  }
  const diff = new PNG({ width: current.width, height: current.height });
  const changedPixels = pixelmatch(baseline.data, current.data, diff.data, current.width, current.height, {
    threshold: 0.1,
    includeAA: false,
  });
  await writeFile(diffPath, PNG.sync.write(diff));
  return { changedPixels, changedRatio: changedPixels / (current.width * current.height) };
}

function imageMarkup(path, alt, viewport) {
  return `<a href="${path}" aria-label="Open full-resolution ${alt}"><img src="${path}" loading="lazy" width="${viewport.width}" height="${viewport.height}" alt="${alt}"></a>`;
}

function renderReport(manifest) {
  const count = (status) => manifest.captures.filter((capture) => capture.status === status).length;
  const renderRows = (viewportName) => manifest.captures.filter((capture) => capture.viewport === viewportName).map((capture) => {
    const state = GALLERY_STATES.find(({ name }) => name === capture.state);
    const viewport = GALLERY_VIEWPORTS.find(({ name }) => name === capture.viewport);
    const unavailable = '<span role="status">Unavailable</span>';
    return `
      <tr class="capture" data-status="${capture.status}">
        <th scope="row">${state.label}</th>
        <td>${capture.assets.baseline ? imageMarkup(capture.assets.baseline, `${state.label} ${viewport.name} baseline`, viewport) : unavailable}</td>
        <td>${imageMarkup(capture.assets.current, `${state.label} ${viewport.name} current`, viewport)}</td>
        <td>${capture.assets.diff ? imageMarkup(capture.assets.diff, `${state.label} ${viewport.name} pixel diff`, viewport) : unavailable}</td>
        <td>${capture.status === 'unavailable' ? 'Baseline unavailable' : `${capture.changedPixels.toLocaleString('en-US')} pixels (${(capture.changedRatio * 100).toFixed(4)}%)`}</td>
      </tr>`;
  }).join('');
  const baselineNotice = manifest.baseSha ? '' : '<p role="status">Baseline unavailable. This current-only report is expected for local builds, master builds, and the initial rollout.</p>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>connect visual regression report</title>
  <style>
    table { width: 100%; table-layout: fixed; }
    img { max-width: 100%; height: auto; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <header>
    <p><a class="preview" href="/">Open interactive preview</a></p>
    <h1>Visual regression report</h1>
    <p>Base: <code>${manifest.baseSha ?? 'unavailable'}</code><br>Head: <code>${manifest.headSha}</code><br>Generated: <time datetime="${manifest.generatedAt}">${manifest.generatedAt}</time></p>
  </header>
  <main>
    ${baselineNotice}
    <p aria-label="Comparison summary">${count('changed')} changed, ${count('unchanged')} unchanged, ${count('unavailable')} unavailable</p>
    <p class="filters" aria-label="Filter captures">
      <button type="button" data-filter="all" aria-pressed="true">All (${manifest.captures.length})</button>
      <button type="button" data-filter="changed" aria-pressed="false">Changed (${count('changed')})</button>
      <button type="button" data-filter="unchanged" aria-pressed="false">Unchanged (${count('unchanged')})</button>
    </p>
    <div id="captures" class="tables">
      <section>
        <h2>Desktop (1280 × 800)</h2>
        <table border="1" cellspacing="0">
          <thead><tr><th>Page</th><th>Baseline</th><th>PR</th><th>Diff</th><th>Result</th></tr></thead>
          <tbody>${renderRows('desktop')}</tbody>
        </table>
      </section>
      <section>
        <h2>Mobile (390 × 844)</h2>
        <table border="1" cellspacing="0">
          <thead><tr><th>Page</th><th>Baseline</th><th>PR</th><th>Diff</th><th>Result</th></tr></thead>
          <tbody>${renderRows('mobile')}</tbody>
        </table>
      </section>
    </div>
  </main>
  <script>
    document.querySelector('.filters').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-filter]');
      if (!button) return;
      const filter = button.dataset.filter;
      document.querySelectorAll('.filters button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      document.querySelectorAll('.capture').forEach((capture) => { capture.hidden = filter !== 'all' && capture.dataset.status !== filter; });
    });
  </script>
</body>
</html>\n`;
}

async function buildReport(captures, output, headSha, baseSha) {
  const currentDirectory = resolve(captures, 'current');
  const baseDirectory = resolve(captures, 'base');
  const hasBaseline = Boolean(baseSha);
  await assertCaptureSet(currentDirectory, 'Current');
  if (hasBaseline) await assertCaptureSet(baseDirectory, 'Baseline');

  const assetsDirectory = resolve(output, 'connect-gallery-assets');
  await rm(assetsDirectory, { recursive: true, force: true });
  await Promise.all(['current', ...(hasBaseline ? ['baseline', 'diff'] : [])]
    .map((name) => mkdir(resolve(assetsDirectory, name), { recursive: true })));

  const results = [];
  for (const state of GALLERY_STATES) {
    for (const viewport of GALLERY_VIEWPORTS) {
      const filename = captureFilename(state.name, viewport.name);
      const currentSource = resolve(currentDirectory, filename);
      const currentAsset = `/connect-gallery-assets/current/${filename}`;
      await copyFile(currentSource, resolve(assetsDirectory, 'current', filename));
      let status = 'unavailable';
      let changedPixels = null;
      let changedRatio = null;
      let baselineAsset = null;
      let diffAsset = null;
      if (hasBaseline) {
        baselineAsset = `/connect-gallery-assets/baseline/${filename}`;
        diffAsset = `/connect-gallery-assets/diff/${filename}`;
        await copyFile(resolve(baseDirectory, filename), resolve(assetsDirectory, 'baseline', filename));
        ({ changedPixels, changedRatio } = await compareImages(
          resolve(baseDirectory, filename),
          currentSource,
          resolve(assetsDirectory, 'diff', filename),
        ));
        status = changedRatio > CHANGE_THRESHOLD ? 'changed' : 'unchanged';
      }
      results.push({
        state: state.name,
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        assets: { baseline: baselineAsset, current: currentAsset, diff: diffAsset },
        changedPixels,
        changedRatio,
        status,
      });
    }
  }

  const manifest = {
    version: GALLERY_VERSION,
    baseSha: baseSha ?? null,
    headSha,
    generatedAt: new Date().toISOString(),
    viewports: Object.fromEntries(GALLERY_VIEWPORTS.map(({ name, width, height }) => [name, { width, height, deviceScaleFactor: 1 }])),
    captures: results,
  };
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(resolve(assetsDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(resolve(output, 'connect-gallery.html'), renderReport(manifest)),
  ]);
  console.log(`Gallery report written to ${resolve(output, 'connect-gallery.html')}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = resolve('.');
  const baseSource = args.base ? resolve(args.base) : null;
  if (Boolean(baseSource) !== Boolean(args['base-sha'])) {
    throw new Error('--base and --base-sha must be supplied together');
  }
  const temporary = await mkdtemp(resolve(tmpdir(), 'connect-gallery-'));
  try {
    const fixtures = resolve(temporary, 'fixtures');
    const currentRenderer = resolve(temporary, 'renderer-current');
    const baseRenderer = resolve(temporary, 'renderer-base');
    const captures = resolve(temporary, 'captures');
    await fetchFixtures(fixtures);
    await buildRenderer(source, fixtures, currentRenderer);
    const renderers = [{ name: 'current', directory: currentRenderer }];
    if (baseSource) {
      await buildRenderer(baseSource, fixtures, baseRenderer);
      renderers.unshift({ name: 'base', directory: baseRenderer });
    }
    await captureRenderers(renderers, captures);
    await buildReport(
      captures,
      resolve(args.output ?? 'dist-gallery'),
      args['head-sha'] ?? process.env.GITHUB_SHA ?? await gitSha(source),
      args['base-sha'],
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
