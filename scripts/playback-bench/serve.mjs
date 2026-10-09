// Local HTTPS only. Never installs certificates, signs in, or publishes files.
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const results = resolve('test-results/playback');
const build = resolve(process.env.BENCH_BUILD || 'test-results/playback/build-submission-final');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
async function serve(req, res) {
  const path = decodeURIComponent(new URL(req.url, 'https://localhost').pathname);
  if (path === '/playback-test.webmanifest') return res.writeHead(200, { 'Content-Type': 'application/manifest+json' }).end(JSON.stringify({ name: 'Connect Local Playback Test', short_name: 'Playback Test', id: '/playback-test', scope: '/', start_url: '/scripts/playback-bench/index.html?details=1&duration=180&media=/media/minute/stream.m3u8&manual=1', display: 'standalone', icons: [{ src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' }] }));
  if (path === '/manifest.json') {
    const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
    manifest.name = 'Connect Local Test'; manifest.short_name = 'Connect Test'; manifest.start_url = '/demo';
    return res.writeHead(200, { 'Content-Type': mime['.json'] }).end(JSON.stringify(manifest));
  }
  const roots = path.startsWith('/media/') ? [resolve(results, 'media')] : [resolve('dist'), build];
  for (const root of roots) {
    const file = resolve(root, path.startsWith('/media/') ? path.slice(7) : '.' + path);
    if (!file.startsWith(root + '/')) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      const headers = { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
      const start = range ? Number(range[1]) : 0;
      const end = range && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      if (start > end || start >= body.length) return res.writeHead(416, { 'Content-Range': `bytes */${body.length}` }).end();
      headers['Content-Length'] = end - start + 1;
      if (range) headers['Content-Range'] = `bytes ${start}-${end}/${body.length}`;
      return res.writeHead(range ? 206 : 200, headers).end(req.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
    } catch {}
  }
  if (!extname(path)) return res.writeHead(200, { 'Content-Type': mime['.html'] }).end(await readFile('dist/index.html'));
  res.writeHead(404).end();
}
const tls = { key: await readFile(resolve(results, 'tls/server.key')), cert: await readFile(resolve(results, 'tls/server.pem')) };
httpsServer(tls, (req, res) => serve(req, res).catch(() => res.writeHead(500).end())).listen(Number(process.env.PORT || 8443), '0.0.0.0');
httpServer(async (req, res) => {
  if (req.url !== '/connect-test-ca.cer') return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert' }).end(await readFile(resolve(results, 'tls/connect-test-ca.cer')));
}).listen(Number(process.env.CERT_PORT || 8080), '0.0.0.0');
console.log('Local test server: https://localhost:8443/demo; certificate download on HTTP port 8080. No trust settings changed.');
