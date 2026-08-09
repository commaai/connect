/* eslint-disable no-await-in-loop -- captures are intentionally serialized in one browser */
import { execFile } from 'node:child_process';
import {
  access, cp, mkdir, mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  basename, dirname, resolve,
} from 'node:path';
import { promisify } from 'node:util';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import puppeteer from 'puppeteer';
import { build, preview } from 'vite';

const ROUTE_NAME = '5beb9b58bd12b691|0000010a--a51155e496';
const [DONGLE_ID, LOG_ID] = ROUTE_NAME.split('|');
const FIXED_TIME = '2026-02-25T18:00:00-08:00';
const FIXED_TIMESTAMP = Date.parse(FIXED_TIME);
const LOCALE = 'en-US';
const TIMEZONE = 'America/Los_Angeles';
const CHANGE_THRESHOLD = 0.0001;
const CAPTURE_CONCURRENCY = 4;

// Mutable so --states can narrow it to the screens being worked on.
let GALLERY_STATES = [
  { name: 'signin', label: 'Sign in', path: '/', readyText: 'Sign in with Google', anonymous: true },
  { name: 'pair', label: 'Pair a device', path: '/', readyText: 'add new device' },
  { name: 'dashboard', label: 'Dashboard', path: `/${DONGLE_ID}`, readyText: 'Bronco Sport' },
  { name: 'drive', label: 'Drive', path: `/${DONGLE_ID}/${LOG_ID}`, readySelector: '.DriveView' },
  { name: 'checkout', label: 'Prime checkout', path: `/${DONGLE_ID}/prime`, readyText: '24/7 connectivity' },
  { name: 'management', label: 'Prime management', path: `/${DONGLE_ID}/prime`, readyText: 'Next payment' },
  { name: 'teleop', label: 'Teleop', path: `/${DONGLE_ID}/stream`, readyText: 'comma body' },
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

async function downloadBaseline(baselineUrl, destination) {
  const root = new URL(baselineUrl);
  const isLoopback = ['127.0.0.1', 'localhost'].includes(root.hostname);
  if (root.protocol !== 'https:' && !isLoopback) {
    throw new Error(`Baseline URL must use HTTPS: ${baselineUrl}`);
  }
  const manifestUrl = new URL('/connect-gallery-assets/manifest.json', root);
  const manifest = await (await getResponse(manifestUrl)).json();
  if (!manifest.headSha || !Array.isArray(manifest.captures)) {
    throw new Error(`Invalid gallery manifest at ${manifestUrl}`);
  }

  await mkdir(destination, { recursive: true });
  const downloads = GALLERY_STATES.flatMap((state) => GALLERY_VIEWPORTS.map(async (viewport) => {
    const capture = manifest.captures.find((item) => (
      item.state === state.name && item.viewport === viewport.name
    ));
    if (!capture?.assets?.current) return false;
    const captureUrl = new URL(capture.assets.current, root);
    try {
      const response = await getResponse(captureUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      readPng(buffer, `Baseline capture ${state.name}/${viewport.name} from ${captureUrl}`);
      await writeFile(
        resolve(destination, captureFilename(state.name, viewport.name)),
        buffer,
      );
      return true;
    } catch (error) {
      console.warn(`Skipping unavailable baseline capture ${state.name}/${viewport.name}: ${error.message}`);
      return false;
    }
  }));
  const downloaded = (await Promise.all(downloads)).filter(Boolean).length;
  if (downloaded === 0) throw new Error(`Gallery manifest at ${manifestUrl} has no compatible captures`);
  console.log(`Downloaded ${downloaded} baseline captures from ${root.origin} (${manifest.headSha})`);
  return manifest.headSha;
}

async function fetchFixtures() {
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
  return {
    events: segmentEvents.map((events) => events.map((event) => ({
      ...event,
      data: {
        ...event.data,
        alertStatus: typeof event.data?.alertStatus === 'number'
          ? ['normal', 'userPrompt', 'critical'][event.data.alertStatus]
          : event.data?.alertStatus,
      },
    }))),
    sprite: Buffer.from(await sprite.arrayBuffer()),
  };
}

function galleryData(origin, pageName) {
  const now = Math.floor(FIXED_TIMESTAMP / 1000);
  const segments = Array.from({ length: 16 }, (_, index) => index);
  const route = {
    car_id: 1238,
    create_time: 1772040714,
    distance: 10.1977,
    dongle_id: DONGLE_ID,
    end_lat: 32.8751,
    end_lng: -117.21,
    endLocation: { place: 'La Jolla', details: 'San Diego, CA' },
    end_time: '2026-02-25T17:45:55',
    end_time_utc_millis: 1772041555000,
    fullname: ROUTE_NAME,
    is_preserved: true,
    is_public: true,
    make: 'ford',
    maxqlog: 15,
    platform: 'FORD_BRONCO_SPORT_MK1',
    procqlog: 15,
    segment_end_times: segments.map((index) => (
      index === 15 ? 1772041555000 : 1772040690000 + (index * 60000)
    )),
    segment_numbers: segments,
    segment_start_times: segments.map((index) => 1772040630000 + (index * 60000)),
    share_exp: '1785555165',
    share_sig: 'fake',
    start_lat: 32.7498,
    start_lng: -117.195,
    startLocation: { place: 'San Diego', details: 'California' },
    start_time: '2026-02-25T17:30:30',
    start_time_utc_millis: 1772040630000,
    url: `${origin}/__gallery-route`,
    version: '0.10.4',
  };
  const device = {
    alias: 'Bronco Sport',
    commacare: true,
    device_type: 'tici',
    dongle_id: DONGLE_ID,
    eligible_features: { prime_data: true },
    fetched_at: now,
    is_owner: true,
    last_athena_ping: now,
    prime: pageName === 'management',
    rpc: { not_car: false },
    serial: 'cb421c10',
    version: '0.10.4',
  };
  const bodyDevice = {
    ...device,
    alias: 'comma body',
    device_type: 'tizi',
    prime: false,
    rpc: { not_car: true },
    version: '0.11.2',
  };
  const profile = {
    email: 'driver@example.com',
    id: 'fake-user',
    superuser: false,
    user_id: 'fake-user',
  };
  return {
    device: pageName === 'teleop' ? bodyDevice : device,
    devices: pageName === 'pair' ? [] : [pageName === 'teleop' ? bodyDevice : device],
    profile,
    route,
    subscribeInfo: {
      allow_data: true,
      amount: 2400,
      device_online: true,
      eligible: true,
      is_prime_sim: true,
      sim_id: '89014103211118510720',
      sim_type: 'blue',
      sim_usable: true,
      trial_claimable: true,
    },
    subscription: {
      amount: 2400,
      cancel_at_period_end: false,
      current_period_end: now + (86400 * 25),
      is_prime_sim: true,
      next_charge_at: now + (86400 * 25),
      plan: 'data',
      status: 'active',
      subscribed_at: now - (86400 * 190),
      trial_end: null,
      user_id: profile.user_id,
    },
  };
}

function jsonResponse(request, value, status = 200) {
  return request.respond({
    status,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(value),
  });
}

async function mockGalleryRequest(request, origin, pageName, fixtures) {
  const url = new URL(request.url());
  if (url.origin === origin) {
    const eventsMatch = url.pathname.match(/^\/__gallery-route\/(\d+)\/events\.json$/);
    if (eventsMatch) return jsonResponse(request, fixtures.events[Number(eventsMatch[1])] ?? []);
    if (/^\/__gallery-route\/\d+\/sprite\.jpg$/.test(url.pathname)) {
      return request.respond({ status: 200, contentType: 'image/jpeg', body: fixtures.sprite });
    }
    if (/^\/__gallery-route\/\d+\/coords\.json$/.test(url.pathname)) {
      return jsonResponse(request, []);
    }
    return request.continue();
  }

  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/hls.js@')) {
    return request.respond({
      status: 200,
      contentType: 'text/javascript',
      body: `
        class GalleryHls {
          static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifestParsed' };
          static isSupported() { return true; }
          constructor() { this.handlers = {}; }
          on(name, handler) { this.handlers[name] = handler; }
          loadSource() { queueMicrotask(() => this.handlers.manifestParsed?.()); }
          attachMedia() {}
          destroy() {}
        }
        window.Hls = GalleryHls;
      `,
    });
  }

  const apiHosts = new Set(['api.comma.ai', 'athena.comma.ai', 'billing.comma.ai']);
  if (!apiHosts.has(url.hostname)) return request.abort('blockedbyclient');
  if (request.method() === 'OPTIONS') {
    return request.respond({
      status: 204,
      headers: {
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const data = galleryData(origin, pageName);
  const path = decodeURIComponent(url.pathname).replace(/\/$/, '');
  if (url.hostname === 'api.comma.ai') {
    if (path === '/v1/me') return jsonResponse(request, data.profile);
    if (path === '/v1/me/devices') return jsonResponse(request, data.devices);
    if (path === '/v1/me/turn') return jsonResponse(request, { iceServers: [] });
    if (path === `/v1.1/devices/${DONGLE_ID}`) return jsonResponse(request, data.device);
    if (path === `/v1.1/devices/${DONGLE_ID}/stats`) {
      return jsonResponse(request, { all: { distance: 2461, minutes: 3814, routes: 173 } });
    }
    if (path === `/v1/devices/${DONGLE_ID}/location`) {
      return jsonResponse(request, {
        lat: data.route.start_lat,
        lng: data.route.start_lng,
        time: Math.floor(FIXED_TIMESTAMP / 1000),
      });
    }
    if (path === `/v1/devices/${DONGLE_ID}/routes_segments`) return jsonResponse(request, [data.route]);
    if (path === `/v1/devices/${DONGLE_ID}/routes/preserved`) return jsonResponse(request, [data.route]);
    if (path === `/v1/route/${ROUTE_NAME}/files`) return jsonResponse(request, {});
    if (path === `/v1/route/${ROUTE_NAME}/qcamera.m3u8`) {
      return request.respond({
        status: 200,
        contentType: 'application/vnd.apple.mpegurl',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: '#EXTM3U\n#EXT-X-ENDLIST\n',
      });
    }
    // Keep the pairing request pending long enough to capture its loading modal.
    if (path === '/v2/pilotpair') return undefined;
  }
  if (url.hostname === 'billing.comma.ai') {
    if (path === '/v1/prime/subscribe_info') return jsonResponse(request, data.subscribeInfo);
    if (path === '/v1/prime/subscription') return jsonResponse(request, data.subscription);
  }
  if (url.hostname === 'athena.comma.ai' && path === `/${DONGLE_ID}`) {
    const payload = JSON.parse(request.postData() || '{}');
    if (payload.method === 'getMessage') {
      return jsonResponse(request, { result: { peripheralState: { voltage: 12300 } } });
    }
    if (payload.method === 'listUploadQueue') return jsonResponse(request, { result: [] });
    if (payload.method === 'getNotCar') return jsonResponse(request, { result: pageName === 'teleop' });
    if (payload.method === 'startStream') {
      return jsonResponse(request, { result: { sdp: 'v=0\r\n', time: 0 } });
    }
    return jsonResponse(request, { result: true });
  }
  throw new Error(`No gallery response for ${request.method()} ${request.url()}`);
}

/**
 * Build one renderer's source tree into a directory the capture step can serve.
 *
 * SvelteKit needs its own path: it builds through an adapter that writes to the
 * directory named in svelte.config.js and ignores Vite's build.outDir, and it
 * has no index.html to hand rollup as an input. So build it in place and copy
 * the adapter's output to where the caller expects it.
 *
 * The plain Vite path below still runs for a `--base` tree that predates the
 * adapter, so an older checkout can be built as the baseline.
 */
async function buildRenderer(source, output) {
  if (await fileExists(resolve(source, 'svelte.config.js'))) {
    await build({ root: source, mode: 'production', base: '/', build: { sourcemap: false } });

    let adapterOutput = null;
    for (const candidate of ['dist', 'build']) {
      if (await fileExists(resolve(source, candidate, 'index.html'))) {
        adapterOutput = resolve(source, candidate);
        break;
      }
    }
    if (!adapterOutput) {
      throw new Error(`No SvelteKit adapter output containing index.html found under ${source}`);
    }

    await rm(output, { recursive: true, force: true });
    await cp(adapterOutput, output, { recursive: true });
    return;
  }

  await build({
    root: source,
    mode: 'production',
    base: '/',
    build: {
      outDir: output,
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: resolve(source, 'index.html'),
      },
    },
  });
}

async function serveDirectory(directory) {
  const server = await preview({
    configFile: false,
    root: dirname(directory),
    build: { outDir: basename(directory) },
    preview: { host: '127.0.0.1', port: 0, strictPort: true },
    plugins: [{
      name: 'gallery-storage-page',
      configurePreviewServer({ middlewares }) {
        middlewares.use('/__gallery-storage', (_request, response) => {
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end('<!doctype html><title>storage</title>');
        });
      },
    }],
  });
  return {
    origin: `http://127.0.0.1:${server.httpServer.address().port}`,
    close: () => server.close(),
  };
}

function readPng(buffer, label) {
  try {
    return PNG.sync.read(buffer);
  } catch (error) {
    throw new Error(`${label} is not a valid PNG: ${error.message}`, { cause: error });
  }
}

function assertNotBlank(buffer, name) {
  const png = readPng(buffer, name);
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
    if (previous && Buffer.compare(previous, buffer) === 0) consecutive += 1;
    else consecutive = 0;
    if (consecutive >= 2) return buffer;
    previous = buffer;
  }
  throw new Error(`${label} did not reach three consecutive stable frames`);
}

async function updateStoredPairToken(page, pairToken) {
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
      const store = transaction.objectStore('keyvaluepairs');
      if (token) store.put(token, 'pairToken');
      else store.delete('pairToken');
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
  if (!action.optional) {
    await page.waitForFunction((details) => Boolean(globalThis.galleryAction(details)), { timeout: 5000 }, target).catch(async (error) => {
      const available = await page.evaluate(() => Array.from(
        document.querySelectorAll('button, [role="button"], [role="menuitem"], [aria-haspopup="true"]'),
        (element) => element.textContent.trim(),
      ).filter(Boolean));
      throw new Error(`${label}: action target ${description} was not visible; available actions: ${available.join(', ')}`, { cause: error });
    });
  }
  const clicked = await page.evaluate((details) => {
    const element = globalThis.galleryAction(details);
    element?.click();
    return Boolean(element);
  }, target);
  if (!clicked) {
    if (action.optional) return;
    throw new Error(`${label}: action target ${description} disappeared before it could be clicked`);
  }
  await page.evaluate(() => new Promise((accept) => requestAnimationFrame(() => requestAnimationFrame(accept))));
  if (page.isClosed()) throw new Error(`${label}: action ${description} closed the page`);
}

async function openGalleryModal(page, state, label) {
  for (const action of state.actions ?? []) await clickGalleryAction(page, action, label);
  if (!state.modalText) return;
  await page.waitForFunction((expected) => {
    return Array.from(document.querySelectorAll('[role="document"]'))
      .some((element) => globalThis.galleryVisible(element) && element.textContent.includes(expected));
  }, { timeout: 5000 }, state.modalText).catch((error) => {
    throw new Error(`${label}: modal containing ${JSON.stringify(state.modalText)} did not open`, { cause: error });
  });
}

async function captureOne(browser, origin, outputPath, state, viewport, fixtures) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const failures = [];
  const pageState = GALLERY_STATES.find(({ name }) => name === (state.page ?? state.name));
  try {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await page.emulateTimezone(TIMEZONE);
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await page.evaluateOnNewDocument((timestamp, authenticated) => {
      const NativeDate = Date;
      class FrozenDate extends NativeDate {
        constructor(...args) { super(...(args.length === 0 ? [timestamp] : args)); }
        static now() { return timestamp; }
      }
      Object.setPrototypeOf(FrozenDate, NativeDate);
      globalThis.Date = FrozenDate;
      if (authenticated) localStorage.setItem('authorization', 'gallery-token');
      else localStorage.removeItem('authorization');
      localStorage.removeItem('selectedDongleId');
      globalThis.galleryVisible = (element) => {
        if (!element) return false;
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      globalThis.galleryAction = ({ selector, targetText }) => {
        const candidates = selector ? [document.querySelector(selector)] : document.querySelectorAll('button, [role="button"], [role="menuitem"], [aria-haspopup="true"]');
        return Array.from(candidates).find((element) => (
          globalThis.galleryVisible(element) && (!targetText || element.textContent.trim() === targetText)
        ));
      };

      class GalleryPeerConnection {
        constructor() {
          this.connectionState = 'new';
          this.listeners = {};
          this.localDescription = null;
          this.transceivers = [];
        }
        addEventListener(name, handler) {
          this.listeners[name] ??= [];
          this.listeners[name].push(handler);
        }
        emit(name, event = {}) {
          for (const handler of this.listeners[name] ?? []) handler(event);
        }
        addTransceiver() {
          const transceiver = { setCodecPreferences() {}, stop() {} };
          this.transceivers.push(transceiver);
          return transceiver;
        }
        createDataChannel() {
          this.dataChannel = {
            readyState: 'open',
            send() {
              setTimeout(() => this.onmessage?.({
                data: JSON.stringify({ type: 'deviceState', data: { started: true } }),
              }), 0);
            },
            close() {},
            onopen: null,
            onclose: null,
            onmessage: null,
          };
          return this.dataChannel;
        }
        async createOffer() { return { type: 'offer', sdp: 'v=0\r\n' }; }
        async setLocalDescription(description) {
          this.localDescription = description;
          setTimeout(() => this.emit('icecandidate', { candidate: null }), 0);
        }
        async setRemoteDescription() {
          this.connectionState = 'connected';
          this.emit('connectionstatechange');
          this.dataChannel?.onopen?.();
          this.dataChannel?.onmessage?.({
            data: JSON.stringify({ type: 'carState', data: { fuelGauge: 0.87, charging: false } }),
          });
          this.dataChannel?.onmessage?.({
            data: JSON.stringify({ type: 'deviceState', data: { started: true } }),
          });
        }
        getReceivers() { return []; }
        getTransceivers() { return this.transceivers; }
        close() { this.connectionState = 'closed'; }
      }
      globalThis.RTCPeerConnection = GalleryPeerConnection;
      globalThis.RTCRtpReceiver = { getCapabilities: () => ({ codecs: [] }) };
    }, FIXED_TIMESTAMP, !pageState.anonymous);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['data:', 'blob:'].includes(new URL(request.url()).protocol)) {
        request.continue();
        return;
      }
      mockGalleryRequest(request, origin, pageState.name, fixtures).catch((error) => {
        failures.push(`request error: ${error.message}`);
        if (!request.isInterceptResolutionHandled()) request.abort('failed').catch(() => {});
      });
    });
    if (state.pairToken) {
      await page.goto(`${origin}/__gallery-storage`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await updateStoredPairToken(page, state.pairToken);
    }
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

    await page.goto(`${origin}${pageState.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForFunction(
      ({ selector, expectedText }) => {
        if (selector && document.querySelector(selector)) return true;
        return expectedText && document.body.innerText.includes(expectedText);
      },
      { timeout: 15000 },
      { selector: pageState.readySelector, expectedText: pageState.readyText },
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
      // React mounts into #root; SvelteKit renders into a wrapper div it owns.
      // Either way the check is the same: the app put something on the page.
      const root = document.getElementById('root') ?? document.querySelector('body > div');
      if (!root || !root.firstElementChild) {
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
    await context.close();
  }
}

async function captureRenderers(renderers, output, fixtures) {
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
      const pending = GALLERY_STATES.flatMap((state) => GALLERY_VIEWPORTS.map((viewport) => ({ state, viewport })));
      await Promise.all(Array.from({ length: CAPTURE_CONCURRENCY }, async () => {
        while (pending.length) {
          const { state, viewport } = pending.shift();
          const filename = captureFilename(state.name, viewport.name);
          await captureOne(browser, server.origin, resolve(destination, filename), state, viewport, fixtures);
          console.log(`Captured ${renderer.name}/${filename}`);
        }
      }));
    } finally {
      if (browser) await browser.close();
      await server.close();
    }
  }
}

async function compareImages(basePath, currentPath, diffPath) {
  const [baseBuffer, currentBuffer] = await Promise.all([readFile(basePath), readFile(currentPath)]);
  const baseline = readPng(baseBuffer, `Baseline image ${basePath}`);
  const current = readPng(currentBuffer, `Current image ${currentPath}`);
  if (baseline.width !== current.width || baseline.height !== current.height) {
    throw new Error(`Image dimensions differ: ${baseline.width}x${baseline.height} vs ${current.width}x${current.height}`);
  }
  const options = {
    threshold: 0.1,
    includeAA: false,
  };
  const changedPixels = pixelmatch(
    baseline.data, current.data, null, current.width, current.height, options,
  );
  const changedRatio = changedPixels / (current.width * current.height);
  const hasDiff = changedRatio > CHANGE_THRESHOLD;
  if (hasDiff) {
    const diff = new PNG({ width: current.width, height: current.height });
    pixelmatch(baseline.data, current.data, diff.data, current.width, current.height, options);
    await writeFile(diffPath, PNG.sync.write(diff));
  }
  return { changedPixels, changedRatio, hasDiff };
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function imageMarkup(path, alt, viewport) {
  return `<a href="${path}" aria-label="Open full-resolution ${alt}"><img src="${path}" loading="lazy" width="${viewport.width}" height="${viewport.height}" alt="${alt}"></a>`;
}

function renderReport(manifest, { showPreviewLink = true } = {}) {
  const hasBaseline = Boolean(manifest.baseSha);
  const count = (status) => manifest.captures.filter((capture) => capture.status === status).length;
  const renderRows = (viewportName) => manifest.captures.filter((capture) => capture.viewport === viewportName).map((capture) => {
    const state = GALLERY_STATES.find(({ name }) => name === capture.state);
    const viewport = GALLERY_VIEWPORTS.find(({ name }) => name === capture.viewport);
    if (!hasBaseline) {
      return `
      <tr class="capture">
        <th scope="row">${state.label}</th>
        <td>${imageMarkup(capture.assets.current, `${state.label} ${viewport.name}`, viewport)}</td>
      </tr>`;
    }
    const unavailable = '<span role="status">Unavailable</span>';
    return `
      <tr class="capture" data-status="${capture.status}">
        <th scope="row">${state.label}</th>
        <td>${capture.assets.baseline ? imageMarkup(capture.assets.baseline, `${state.label} ${viewport.name} baseline`, viewport) : unavailable}</td>
        <td>${imageMarkup(capture.assets.current, `${state.label} ${viewport.name} current`, viewport)}</td>
        <td>${capture.assets.diff
    ? imageMarkup(capture.assets.diff, `${state.label} ${viewport.name} pixel diff`, viewport)
    : capture.status === 'unchanged' ? 'No pixel changes' : unavailable}</td>
        <td>${capture.status === 'unavailable' ? 'Baseline unavailable' : `${capture.changedPixels.toLocaleString('en-US')} pixels (${(capture.changedRatio * 100).toFixed(4)}%)`}</td>
      </tr>`;
  }).join('');
  const tables = GALLERY_VIEWPORTS.map((viewport) => `
      <section>
        <h2>${viewport.name[0].toUpperCase()}${viewport.name.slice(1)} (${viewport.width} × ${viewport.height})</h2>
        <table class="${hasBaseline ? 'comparison' : 'gallery'}" border="1" cellspacing="0">
          <thead>${hasBaseline
    ? '<tr><th>Page</th><th>Baseline</th><th>PR</th><th>Diff</th><th>Result</th></tr>'
    : '<tr><th>Page</th><th>Screenshot</th></tr>'}</thead>
          <tbody>${renderRows(viewport.name)}</tbody>
        </table>
      </section>`).join('');
  const comparisonControls = hasBaseline ? `
    <p aria-label="Comparison summary">${count('changed')} changed, ${count('unchanged')} unchanged, ${count('unavailable')} unavailable</p>
    <p class="filters" aria-label="Filter captures">
      <button type="button" data-filter="all" aria-pressed="true">All (${manifest.captures.length})</button>
      <button type="button" data-filter="changed" aria-pressed="false">Changed (${count('changed')})</button>
      <button type="button" data-filter="unchanged" aria-pressed="false">Unchanged (${count('unchanged')})</button>
    </p>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>connect ${hasBaseline ? 'visual regression report' : 'gallery'}</title>
  <style>
    table { width: 100%; table-layout: fixed; }
    table th:first-child { width: 7rem; }
    table.comparison th:last-child { width: 9rem; }
    td > a { display: block; max-width: 100%; overflow: auto; }
    img { display: block; width: auto; max-width: none; height: auto; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <header>
    ${showPreviewLink ? '<p><a class="preview" href="/">Open interactive preview</a></p>' : ''}
    <h1>${hasBaseline ? 'Visual regression report' : 'Gallery'}</h1>
    <p>${hasBaseline ? `Base: <code>${manifest.baseSha}</code><br>` : ''}Head: <code>${manifest.headSha}</code><br>Generated: <time datetime="${manifest.generatedAt}">${manifest.generatedAt}</time></p>
  </header>
  <main>
    ${comparisonControls}
    <div id="captures" class="tables">
      ${tables}
    </div>
  </main>
  ${hasBaseline ? `<script>
    document.querySelector('.filters').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-filter]');
      if (!button) return;
      const filter = button.dataset.filter;
      document.querySelectorAll('.filters button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      document.querySelectorAll('.capture').forEach((capture) => { capture.hidden = filter !== 'all' && capture.dataset.status !== filter; });
    });
  </script>` : ''}
</body>
</html>\n`;
}

async function renderSelfContainedReport(manifest, output) {
  const inlineManifest = JSON.parse(JSON.stringify(manifest));
  await Promise.all(inlineManifest.captures.flatMap((capture) => (
    Object.entries(capture.assets).map(async ([name, asset]) => {
      if (!asset) return;
      const contents = await readFile(resolve(output, asset.replace(/^\/+/, '')));
      capture.assets[name] = `data:image/png;base64,${contents.toString('base64')}`;
    })
  )));
  return renderReport(inlineManifest, { showPreviewLink: false });
}

async function buildReport(captures, output, headSha, baseSha, baselineUrl, artifactOutput) {
  const currentDirectory = resolve(captures, 'current');
  const baseDirectory = resolve(captures, 'base');
  const hasBaseline = Boolean(baseSha);

  const assetsDirectory = resolve(output, 'connect-gallery-assets');
  await rm(assetsDirectory, { recursive: true, force: true });
  await cp(currentDirectory, resolve(assetsDirectory, 'current'), { recursive: true });
  if (hasBaseline) {
    await Promise.all([
      cp(baseDirectory, resolve(assetsDirectory, 'baseline'), { recursive: true }),
      mkdir(resolve(assetsDirectory, 'diff'), { recursive: true }),
    ]);
  }

  const results = [];
  for (const state of GALLERY_STATES) {
    for (const viewport of GALLERY_VIEWPORTS) {
      const filename = captureFilename(state.name, viewport.name);
      const currentSource = resolve(currentDirectory, filename);
      const currentAsset = `./connect-gallery-assets/current/${filename}`;
      let status = 'unavailable';
      let changedPixels = null;
      let changedRatio = null;
      let baselineAsset = null;
      let diffAsset = null;
      const baselineSource = resolve(baseDirectory, filename);
      if (hasBaseline && await fileExists(baselineSource)) {
        baselineAsset = `./connect-gallery-assets/baseline/${filename}`;
        let hasDiff;
        ({ changedPixels, changedRatio, hasDiff } = await compareImages(
          baselineSource,
          currentSource,
          resolve(assetsDirectory, 'diff', filename),
        ));
        status = changedRatio > CHANGE_THRESHOLD ? 'changed' : 'unchanged';
        if (hasDiff) diffAsset = `./connect-gallery-assets/diff/${filename}`;
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
    version: 2,
    baseSha: baseSha ?? null,
    baselineUrl: baselineUrl ?? null,
    headSha,
    generatedAt: new Date().toISOString(),
    viewports: Object.fromEntries(GALLERY_VIEWPORTS.map(({ name, width, height }) => [name, { width, height, deviceScaleFactor: 1 }])),
    captures: results,
  };
  await mkdir(output, { recursive: true });
  const writes = [
    writeFile(resolve(assetsDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(resolve(output, 'connect-gallery.html'), renderReport(manifest)),
  ];
  if (artifactOutput) {
    await mkdir(dirname(artifactOutput), { recursive: true });
    writes.push(renderSelfContainedReport(manifest, output).then((report) => (
      writeFile(artifactOutput, report)
    )));
  }
  await Promise.all(writes);
  console.log(`Gallery report written to ${resolve(output, 'connect-gallery.html')}`);
  if (artifactOutput) console.log(`Self-contained gallery artifact written to ${artifactOutput}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = resolve('.');
  const baseSource = args.base ? resolve(args.base) : null;
  const baselineUrl = args['baseline-url'] ?? null;
  if (Boolean(baseSource) !== Boolean(args['base-sha'])) {
    throw new Error('--base and --base-sha must be supplied together');
  }
  if (baseSource && baselineUrl) throw new Error('--base and --baseline-url are mutually exclusive');
  if (args.states) {
    const wanted = new Set(args.states.split(',').map((name) => name.trim()).filter(Boolean));
    const unknown = [...wanted].filter((name) => !GALLERY_STATES.some((state) => state.name === name));
    if (unknown.length) throw new Error(`Unknown --states: ${unknown.join(', ')}`);

    // A modal state is captured by opening it on top of another state's page, so
    // asking for one has to pull its base in too or captureOne has nothing to load.
    const pulled = [];
    for (const state of GALLERY_STATES) {
      if (wanted.has(state.name) && state.page && !wanted.has(state.page)) {
        wanted.add(state.page);
        pulled.push(`${state.page} (base of ${state.name})`);
      }
    }

    const skipped = GALLERY_STATES.filter((state) => !wanted.has(state.name)).map((s) => s.name);
    GALLERY_STATES = GALLERY_STATES.filter((state) => wanted.has(state.name));
    console.log(`--states limited this run to ${[...wanted].join(', ')}`);
    if (pulled.length) console.log(`  pulled in: ${pulled.join(', ')}`);
    if (skipped.length) console.log(`  skipped: ${skipped.join(', ')}`);
  }
  const temporary = await mkdtemp(resolve(tmpdir(), 'connect-gallery-'));
  try {
    const output = resolve(args.output ?? 'dist-gallery');
    const currentRenderer = output;
    const baseRenderer = resolve(temporary, 'renderer-base');
    const captures = resolve(temporary, 'captures');
    const fixtures = await fetchFixtures();
    await buildRenderer(source, currentRenderer);
    const renderers = [{ name: 'current', directory: currentRenderer }];
    if (baseSource) {
      await buildRenderer(baseSource, baseRenderer);
      renderers.unshift({ name: 'base', directory: baseRenderer });
    }
    await captureRenderers(renderers, captures, fixtures);
    let baseSha = args['base-sha'];
    if (baselineUrl) {
      try {
        baseSha = await downloadBaseline(baselineUrl, resolve(captures, 'base'));
      } catch (error) {
        console.warn(`Baseline unavailable from ${baselineUrl}; writing a current-only gallery: ${error.message}`);
      }
    }
    await buildReport(
      captures,
      output,
      args['head-sha'] ?? process.env.GITHUB_SHA ?? await gitSha(source),
      baseSha,
      baselineUrl,
      args['artifact-output'] ? resolve(args['artifact-output']) : null,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
