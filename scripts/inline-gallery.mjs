import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDir = resolve('dist-gallery');
const htmlPath = resolve(outputDir, 'connect-gallery.html');
let html = await readFile(htmlPath, 'utf8');
const assets = await readdir(resolve(outputDir, 'assets'));

for (const file of assets) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (file.endsWith('.css')) {
    const css = await readFile(resolve(outputDir, 'assets', file), 'utf8');
    html = html.replace(new RegExp(`<link[^>]+href="/assets/${escaped}"[^>]*>`), () => `<style>${css}</style>`);
  } else if (file.endsWith('.js')) {
    const js = await readFile(resolve(outputDir, 'assets', file), 'utf8');
    html = html.replace(new RegExp(`<script[^>]+src="/assets/${escaped}"[^>]*></script>`), () => `<script type="module">${js}</script>`);
    const dataUrl = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
    html = html.replaceAll(`/assets/${file}`, dataUrl).replaceAll(`./assets/${file}`, dataUrl);
  }
}

for (const file of assets.filter((name) => name.endsWith('.js'))) {
  const js = await readFile(resolve(outputDir, 'assets', file), 'utf8');
  const dataUrl = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  html = html.replaceAll(`/assets/${file}`, dataUrl).replaceAll(`./assets/${file}`, dataUrl);
}

html = html.replace(/<link rel="modulepreload"[^>]+>/g, '');

const publicImages = [
  ['images/comma-white.png', 'image/png'],
  ['images/comma-device.png', 'image/png'],
];
for (const [file, mime] of publicImages) {
  const contents = await readFile(resolve('public', file));
  html = html.replaceAll(`/${file}`, `data:${mime};base64,${contents.toString('base64')}`);
}

await writeFile(htmlPath, html);
await writeFile(resolve('connect-gallery-output.html'), html);
for (const entry of await readdir(outputDir)) {
  if (entry !== 'connect-gallery.html') {
    await rm(resolve(outputDir, entry), { recursive: true, force: true });
  }
}
console.log(resolve('connect-gallery-output.html'));
