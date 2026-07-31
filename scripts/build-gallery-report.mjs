/* eslint-disable no-await-in-loop -- report entries are emitted in deterministic display order */
import {
  copyFile, mkdir, readFile, readdir, rm, writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import {
  captureFilename, GALLERY_STATES, GALLERY_VERSION, GALLERY_VIEWPORTS, parseArgs, requiredArg,
} from './gallery/config.mjs';

const CHANGE_THRESHOLD = 0.0001;

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
  const totalPixels = current.width * current.height;
  return { changedPixels, changedRatio: changedPixels / totalPixels };
}

async function assertImageDimensions(path, viewport) {
  const image = PNG.sync.read(await readFile(path));
  if (image.width !== viewport.width || image.height !== viewport.height) {
    throw new Error(`${path} must be ${viewport.width}x${viewport.height}; found ${image.width}x${image.height}`);
  }
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

export async function buildGalleryReport({ capturesDirectory, outputDirectory, headSha, baseSha, generatedAt = new Date().toISOString() }) {
  const captures = resolve(capturesDirectory);
  const currentDirectory = resolve(captures, 'current');
  const baseDirectory = resolve(captures, 'base');
  const metadata = JSON.parse(await readFile(resolve(captures, 'capture.json'), 'utf8'));
  await assertCaptureSet(currentDirectory, 'Current');
  if (metadata.hasBaseline) await assertCaptureSet(baseDirectory, 'Baseline');
  if (Boolean(baseSha) !== Boolean(metadata.hasBaseline)) {
    throw new Error('The supplied base SHA does not match baseline capture availability');
  }

  const output = resolve(outputDirectory);
  const assetsDirectory = resolve(output, 'connect-gallery-assets');
  await rm(assetsDirectory, { recursive: true, force: true });
  await Promise.all(['current', ...(metadata.hasBaseline ? ['baseline', 'diff'] : [])].map((name) => mkdir(resolve(assetsDirectory, name), { recursive: true })));

  const results = [];
  for (const state of GALLERY_STATES) {
    for (const viewport of GALLERY_VIEWPORTS) {
      const filename = captureFilename(state.name, viewport.name);
      const currentSource = resolve(currentDirectory, filename);
      const currentAsset = `/connect-gallery-assets/current/${filename}`;
      await assertImageDimensions(currentSource, viewport);
      await copyFile(currentSource, resolve(assetsDirectory, 'current', filename));
      let status = 'unavailable';
      let changedPixels = null;
      let changedRatio = null;
      let baselineAsset = null;
      let diffAsset = null;
      if (metadata.hasBaseline) {
        await assertImageDimensions(resolve(baseDirectory, filename), viewport);
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
    generatedAt,
    viewports: Object.fromEntries(GALLERY_VIEWPORTS.map(({ name, width, height }) => [name, { width, height, deviceScaleFactor: 1 }])),
    captures: results,
  };
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(resolve(assetsDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(resolve(output, 'connect-gallery.html'), renderReport(manifest)),
  ]);
  console.log(`Gallery report written to ${resolve(output, 'connect-gallery.html')}`);
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await buildGalleryReport({
    capturesDirectory: requiredArg(args, 'captures'),
    outputDirectory: requiredArg(args, 'output'),
    headSha: requiredArg(args, 'head-sha'),
    baseSha: args['base-sha'],
    generatedAt: args['generated-at'],
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
