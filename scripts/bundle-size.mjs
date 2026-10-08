import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// Compare builds made with the same environment, dependencies and compression settings.
const files = readdirSync('dist/assets').filter(file => file.endsWith('.js'));
const totals = files.reduce((total, file) => {
  const content = readFileSync(`dist/assets/${file}`);
  total.javascript_bytes += content.length;
  total.gzip_bytes += gzipSync(content).length;
  return total;
}, { javascript_bytes: 0, gzip_bytes: 0, files: files.length });
const baseline = process.argv[2] && JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify({ ...totals, ...(baseline && { delta: {
  javascript_bytes: totals.javascript_bytes - baseline.javascript_bytes,
  gzip_bytes: totals.gzip_bytes - baseline.gzip_bytes,
} }) }, null, 2));
