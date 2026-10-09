import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const ref = process.argv[2] || '109edb39ffa7a4ad3c38788ca2f39a286538ff07';
const root = resolve('test-results/playback/baseline-source');
await mkdir(root, { recursive: true });
const archive = execFileSync('git', ['archive', ref], { maxBuffer: 50 * 1024 * 1024 });
execFileSync('tar', ['-x', '-C', root], { input: archive });
// Test observation only: no behavior change to the original map/timeline.
for (const name of ['DriveMap', 'Timeline']) {
  const file = resolve(root, `src/components/${name}/index.jsx`);
  await writeFile(file, (await readFile(file, 'utf8')).replace(`class ${name} extends Component`, `export class ${name} extends Component`));
}
console.log(`Archived ${ref} to ${root}; install its original locked dependencies before benchmarking.`);
