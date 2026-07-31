/* eslint-disable no-await-in-loop -- fixture generation is deliberately ordered */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import puppeteer from 'puppeteer';
import { buildGalleryReport } from '../build-gallery-report.mjs';
import { serveDirectory } from '../capture-gallery.mjs';
import { captureFilename, GALLERY_STATES, GALLERY_VIEWPORTS } from './config.mjs';

test('the capture catalog includes each modal as an independent page variant', () => {
  const modals = GALLERY_STATES.filter(({ modalText }) => modalText);
  assert.deepEqual(modals.map(({ name }) => name), [
    'pair-device-modal',
    'date-filter-modal',
    'device-settings-modal',
    'unpair-device-modal',
    'upload-queue-modal',
    'switch-prime-plan-modal',
    'cancel-prime-modal',
    'pairing-status-modal',
  ]);
  assert.ok(modals.every(({ page, actions, pairToken }) => page && (actions?.length || pairToken)));
});

async function makeCaptureSet(root, mutate = false) {
  await Promise.all(['base', 'current'].map((name) => mkdir(resolve(root, name), { recursive: true })));
  for (const state of GALLERY_STATES) {
    for (const viewport of GALLERY_VIEWPORTS) {
      const png = new PNG({ width: viewport.width, height: viewport.height });
      png.data.fill(255);
      const baseline = PNG.sync.write(png);
      const filename = captureFilename(state.name, viewport.name);
      await writeFile(resolve(root, 'base', filename), baseline);
      if (mutate && state.name === 'signin' && viewport.name === 'mobile') {
        for (let y = 0; y < 20; y += 1) {
          for (let x = 0; x < 20; x += 1) {
            const offset = ((y * viewport.width) + x) * 4;
            png.data[offset] = 0;
            png.data[offset + 1] = 0;
            png.data[offset + 2] = 0;
          }
        }
      }
      await writeFile(resolve(root, 'current', filename), PNG.sync.write(png));
    }
  }
  await writeFile(resolve(root, 'capture.json'), `${JSON.stringify({ hasBaseline: true })}\n`);
}

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(resolve(tmpdir(), 'gallery-report-test-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('identical capture sets produce unchanged comparisons and loadable assets', async () => {
  await withTemporaryDirectory(async (root) => {
    const captures = resolve(root, 'captures');
    const output = resolve(root, 'output');
    await makeCaptureSet(captures);
    const manifest = await buildGalleryReport({ capturesDirectory: captures, outputDirectory: output, headSha: 'head', baseSha: 'base' });
    assert.equal(manifest.captures.length, GALLERY_STATES.length * GALLERY_VIEWPORTS.length);
    assert.ok(manifest.captures.every(({ status, changedPixels }) => status === 'unchanged' && changedPixels === 0));
    for (const capture of manifest.captures) {
      for (const path of Object.values(capture.assets)) await readFile(resolve(output, path.slice(1)));
    }
    const html = await readFile(resolve(output, 'connect-gallery.html'), 'utf8');
    assert.match(html, /href="\/">Open interactive preview/);
    assert.match(html, /data-filter="changed"/);
    assert.match(html, /loading="lazy"/);
  });
});

test('a visible delta is reported as changed without failing generation', async () => {
  await withTemporaryDirectory(async (root) => {
    const captures = resolve(root, 'captures');
    await makeCaptureSet(captures, true);
    const manifest = await buildGalleryReport({ capturesDirectory: captures, outputDirectory: resolve(root, 'output'), headSha: 'head', baseSha: 'base' });
    const changed = manifest.captures.filter(({ status }) => status === 'changed');
    assert.equal(changed.length, 1);
    assert.equal(changed[0].state, 'signin');
    assert.ok(changed[0].changedPixels >= 400);
    assert.ok(changed[0].changedRatio > 0.0001);
  });
});

test('a missing screenshot fails report generation', async () => {
  await withTemporaryDirectory(async (root) => {
    const captures = resolve(root, 'captures');
    await makeCaptureSet(captures);
    await unlink(resolve(captures, 'current', captureFilename('signin', 'desktop')));
    await assert.rejects(
      buildGalleryReport({ capturesDirectory: captures, outputDirectory: resolve(root, 'output'), headSha: 'head', baseSha: 'base' }),
      new RegExp(`exactly ${GALLERY_STATES.length * GALLERY_VIEWPORTS.length} expected PNGs`),
    );
  });
});

test('current-only captures produce a visible baseline-unavailable report', async () => {
  await withTemporaryDirectory(async (root) => {
    const captures = resolve(root, 'captures');
    const output = resolve(root, 'output');
    await makeCaptureSet(captures);
    await rm(resolve(captures, 'base'), { recursive: true });
    await writeFile(resolve(captures, 'capture.json'), `${JSON.stringify({ hasBaseline: false })}\n`);
    const manifest = await buildGalleryReport({ capturesDirectory: captures, outputDirectory: output, headSha: 'head' });
    assert.ok(manifest.captures.every(({ status }) => status === 'unavailable'));
    const html = await readFile(resolve(output, 'connect-gallery.html'), 'utf8');
    assert.match(html, /Baseline unavailable/);
  });
});

test('the static report loads its assets and filters rows in a browser', async () => {
  await withTemporaryDirectory(async (root) => {
    const captures = resolve(root, 'captures');
    const output = resolve(root, 'output');
    await makeCaptureSet(captures);
    await buildGalleryReport({ capturesDirectory: captures, outputDirectory: output, headSha: 'head', baseSha: 'base' });
    const server = await serveDirectory(output);
    const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.goto(`${server.origin}/connect-gallery.html`, { waitUntil: 'networkidle0' });
      assert.equal(await page.$$eval('.capture', (nodes) => nodes.length), GALLERY_STATES.length * GALLERY_VIEWPORTS.length);
      assert.equal(await page.$eval('a.preview', (link) => link.getAttribute('href')), '/');
      assert.match(await page.$eval('td a', (link) => link.getAttribute('href')), /\.png$/);
      await page.click('button[data-filter="changed"]');
      assert.equal(await page.$$eval('.capture:not([hidden])', (nodes) => nodes.length), 0);
      await page.click('button[data-filter="unchanged"]');
      assert.equal(await page.$$eval('.capture:not([hidden])', (nodes) => nodes.length), GALLERY_STATES.length * GALLERY_VIEWPORTS.length);
      await page.$$eval('img', (images) => images.forEach((image) => { image.loading = 'eager'; }));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
    } finally {
      await browser.close();
      await server.close();
    }
  });
});
