// Manual before/after review only; never use this server for timing benchmarks.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const media = resolve('test-results/playback/media');
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.m3u8':'application/vnd.apple.mpegurl', '.ts':'video/mp2t', '.jpg':'image/jpeg', '.png':'image/png' };
for (const [phase, port, label] of [['submission-baseline',33382,'Original player'],['submission-final',33381,'Current local player']]) {
  const build = resolve(`test-results/playback/build-${phase}`);
  let missing = false;
  createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/__fault' && req.method === 'POST') { missing = url.searchParams.get('enabled') === '1'; return res.writeHead(200).end('Missing manifest: '+missing); }
      if (url.pathname === '/') return res.writeHead(200, {'Content-Type':'text/html'}).end(`<h1>${label}</h1><p>Generated footage, actual Connect controls. Open one player at a time for manual comparison.</p><p><a href="/scripts/playback-bench/index.html?details=1&duration=180&media=/media/minute/stream.m3u8">Open normal player</a> · <a href="/scripts/playback-bench/index.html?details=1&duration=180&media=/media/minute/gap.m3u8">Open missing-minute player</a></p><button onclick="fetch('/__fault?enabled=1',{method:'POST'}).then(()=>document.querySelector('output').textContent='Fault ON: reload player to test unavailable manifest')">Enable missing manifest</button><button onclick="fetch('/__fault?enabled=0',{method:'POST'}).then(()=>document.querySelector('output').textContent='Fault OFF: return to player and try Retry')">Restore manifest</button><output style="display:block;margin-top:16px">Fault OFF</output>`);
      if (url.pathname === '/__hls.js') return res.writeHead(200, {'Content-Type':mime['.js']}).end(await readFile('node_modules/hls.js/dist/hls.min.js'));
      const isMedia = url.pathname.startsWith('/media/');
      if (missing && isMedia && url.pathname.endsWith('.m3u8')) return res.writeHead(404).end('Deliberate local test failure');
      const root = isMedia ? media : build;
      const path = resolve(root, isMedia ? url.pathname.slice(7) : '.'+url.pathname);
      if (!path.startsWith(root+'/')) return res.writeHead(403).end();
      let body = await readFile(path);
      if (extname(path) === '.html') body = Buffer.from(body.toString().replace('<head>', '<head><script src="/__hls.js"></script>'));
      const headers = {'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes'};
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
      const start = range ? Number(range[1]) : 0;
      const end = range && range[2] ? Math.min(Number(range[2]),body.length-1) : body.length-1;
      if (start > end || start >= body.length) return res.writeHead(416,{'Content-Range':`bytes */${body.length}`}).end();
      headers['Content-Length'] = end-start+1;
      if (range) headers['Content-Range'] = `bytes ${start}-${end}/${body.length}`;
      res.writeHead(range?206:200,headers).end(req.method==='HEAD' ? undefined : body.subarray(start,end+1));
    } catch { res.writeHead(404).end(); }
  }).listen(port,'127.0.0.1',()=>console.log(`${label}: http://localhost:${port}`));
}
