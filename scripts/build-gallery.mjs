import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';

const routeName = '5beb9b58bd12b691|0000010a--a51155e496';
const routeUrl = `https://api.commadotai.com/v1/route/${encodeURIComponent(routeName)}/`;
const eventsPath = resolve('src/gallery-fixtures/events.generated.json');

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

try {
  const route = await getJson(routeUrl);
  const assetRoot = new URL(route.url);
  if (assetRoot.protocol !== 'https:') {
    throw new Error(`Expected an HTTPS route asset URL, got ${route.url}`);
  }

  const segmentEvents = await Promise.all(
    Array.from({ length: route.maxqlog + 1 }, (_, segment) => (
      getJson(`${assetRoot.href.replace(/\/$/, '')}/${segment}/events.json`)
    )),
  );
  const events = segmentEvents.flat();

  await mkdir(dirname(eventsPath), { recursive: true });
  await writeFile(eventsPath, `${JSON.stringify(events)}\n`);
  console.log(`Downloaded ${events.length} gallery events from ${routeName}`);

  await build({ mode: 'gallery' });
  await import('./inline-gallery.mjs');
} finally {
  await rm(eventsPath, { force: true });
}
