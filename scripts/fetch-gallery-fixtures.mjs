import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, requiredArg } from './gallery/config.mjs';

const ROUTE_NAME = '5beb9b58bd12b691|0000010a--a51155e496';

async function getResponse(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response;
}

export async function fetchGalleryFixtures(outputDirectory) {
  const output = resolve(outputDirectory);
  const routeUrl = `https://api.commadotai.com/v1/route/${encodeURIComponent(ROUTE_NAME)}/`;
  const route = await (await getResponse(routeUrl)).json();
  const assetRoot = new URL(route.url);
  if (assetRoot.protocol !== 'https:') {
    throw new Error(`Expected an HTTPS route asset URL, got ${route.url}`);
  }
  const assetRootUrl = assetRoot.href.replace(/\/$/, '');
  const segmentEvents = await Promise.all(
    Array.from({ length: route.maxqlog + 1 }, async (_, segment) => (
      (await getResponse(`${assetRootUrl}/${segment}/events.json`)).json()
    )),
  );
  const spriteResponse = await getResponse(`${assetRootUrl}/0/sprite.jpg`);

  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(resolve(output, 'events.json'), `${JSON.stringify(segmentEvents.flat())}\n`),
    writeFile(resolve(output, 'sprite.jpg'), Buffer.from(await spriteResponse.arrayBuffer())),
    writeFile(resolve(output, 'fixture.json'), `${JSON.stringify({ route: ROUTE_NAME, segments: route.maxqlog + 1 }, null, 2)}\n`),
  ]);
  return output;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = await fetchGalleryFixtures(requiredArg(args, 'output'));
  console.log(`Gallery fixtures written to ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
