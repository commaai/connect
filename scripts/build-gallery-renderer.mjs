import {
  copyFile, mkdir, readFile, rm, stat, writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { parseArgs, requiredArg } from './gallery/config.mjs';

async function optionalFile(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertFile(path) {
  const details = await stat(path);
  if (!details.isFile() || details.size === 0) throw new Error(`Fixture is empty: ${path}`);
}

export async function buildGalleryRenderer({ sourceDirectory = '.', fixturesDirectory, outputDirectory }) {
  const source = resolve(sourceDirectory);
  const fixtures = resolve(fixturesDirectory);
  const output = resolve(outputDirectory);
  const generatedEvents = resolve(source, 'src/gallery-fixtures/events.generated.json');
  const generatedSprite = resolve(
    source,
    'src/gallery-fixtures/5beb9b58bd12b691/0000010a--a51155e496/0/sprite.jpg',
  );
  const fixtureEvents = resolve(fixtures, 'events.json');
  const fixtureSprite = resolve(fixtures, 'sprite.jpg');
  await Promise.all([assertFile(fixtureEvents), assertFile(fixtureSprite)]);

  const backups = await Promise.all([optionalFile(generatedEvents), optionalFile(generatedSprite)]);
  await Promise.all([mkdir(dirname(generatedEvents), { recursive: true }), mkdir(dirname(generatedSprite), { recursive: true })]);
  await Promise.all([copyFile(fixtureEvents, generatedEvents), copyFile(fixtureSprite, generatedSprite)]);

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
  return output;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = await buildGalleryRenderer({
    sourceDirectory: args.source ?? '.',
    fixturesDirectory: requiredArg(args, 'fixtures'),
    outputDirectory: requiredArg(args, 'output'),
  });
  console.log(`Gallery renderer built at ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
