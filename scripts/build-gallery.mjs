import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { buildGalleryRenderer } from './build-gallery-renderer.mjs';
import { buildGalleryReport } from './build-gallery-report.mjs';
import { captureGallery } from './capture-gallery.mjs';
import { fetchGalleryFixtures } from './fetch-gallery-fixtures.mjs';
import { parseArgs } from './gallery/config.mjs';

const execute = promisify(execFile);

async function gitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim();
  } catch {
    return 'local';
  }
}

const args = parseArgs(process.argv.slice(2));
const temporary = await mkdtemp(resolve(tmpdir(), 'connect-gallery-'));

try {
  const fixtures = args.fixtures ? resolve(args.fixtures) : resolve(temporary, 'fixtures');
  const renderer = resolve(temporary, 'renderer');
  const captures = resolve(temporary, 'captures');
  if (!args.fixtures) await fetchGalleryFixtures(fixtures);
  await buildGalleryRenderer({ fixturesDirectory: fixtures, outputDirectory: renderer });
  await captureGallery({ currentDirectory: renderer, outputDirectory: captures });
  await buildGalleryReport({
    capturesDirectory: captures,
    outputDirectory: resolve(args.output ?? 'dist-gallery'),
    headSha: await gitSha(),
  });
} finally {
  await rm(temporary, { recursive: true, force: true });
}
