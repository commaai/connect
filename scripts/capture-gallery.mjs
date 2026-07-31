/* eslint-disable no-await-in-loop -- captures are intentionally serialized in one browser */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir, rm, stat, writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import puppeteer from 'puppeteer';
import {
  captureFilename, FIXED_TIME, GALLERY_STATES, GALLERY_VERSION, GALLERY_VIEWPORTS, LOCALE, parseArgs, requiredArg, TIMEZONE,
} from './gallery/config.mjs';

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

export function serveDirectory(directory) {
  const root = resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const relative = decodeURIComponent(url.pathname === '/' ? '/connect-gallery.html' : url.pathname);
      const path = resolve(root, `.${relative}`);
      if (path !== root && !path.startsWith(`${root}${sep}`)) {
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
    const clicked = await page.evaluate(click, target);
    if (!clicked) return;
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
    const clicked = await page.evaluate(click, target);
    if (!clicked) {
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
  const fixedTimestamp = Date.parse(FIXED_TIME);
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
        constructor(...args) {
          super(...(args.length === 0 ? [timestamp] : args));
        }

        static now() { return timestamp; }
      }
      Object.setPrototypeOf(FrozenDate, NativeDate);
      globalThis.Date = FrozenDate;
    }, fixedTimestamp);
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

async function validateRenderer(directory) {
  const html = resolve(directory, 'connect-gallery.html');
  const details = await stat(html);
  if (!details.isFile() || details.size === 0) throw new Error(`Renderer is missing ${html}`);
}

export async function captureGallery({ currentDirectory, baseDirectory, outputDirectory }) {
  const renderers = [
    ...(baseDirectory ? [{ name: 'base', directory: resolve(baseDirectory) }] : []),
    { name: 'current', directory: resolve(currentDirectory) },
  ];
  await Promise.all(renderers.map(({ directory }) => validateRenderer(directory)));
  const output = resolve(outputDirectory);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const servers = await Promise.all(renderers.map(async (renderer) => ({
    ...renderer,
    server: await serveDirectory(renderer.directory),
  })));
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
    for (const renderer of servers) {
      const destination = resolve(output, renderer.name);
      await mkdir(destination, { recursive: true });
      for (const state of GALLERY_STATES) {
        for (const viewport of GALLERY_VIEWPORTS) {
          const filename = captureFilename(state.name, viewport.name);
          await captureOne(browser, renderer.server.origin, resolve(destination, filename), state, viewport);
          console.log(`Captured ${renderer.name}/${filename}`);
        }
      }
    }
    await writeFile(resolve(output, 'capture.json'), `${JSON.stringify({
      version: GALLERY_VERSION,
      hasBaseline: Boolean(baseDirectory),
      states: GALLERY_STATES.map(({ name }) => name),
      viewports: GALLERY_VIEWPORTS,
    }, null, 2)}\n`);
  } finally {
    if (browser) await browser.close();
    await Promise.all(servers.map(({ server }) => server.close()));
  }
  return output;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await captureGallery({
    currentDirectory: requiredArg(args, 'current'),
    baseDirectory: args.base,
    outputDirectory: requiredArg(args, 'output'),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
