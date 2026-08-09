/**
 * Vite dev plugin that serves a fake comma backend at /__mock.
 *
 * Enabled by VITE_MOCK_API; see .env.mock and `bun run start:mock`. The app is
 * pointed at it purely through the existing VITE_*_URL_ROOT env vars, so no
 * application code knows this exists and nothing ships to production.
 *
 * Intercepting at the dev server (rather than patching window.fetch) means
 * XHR, <video>, and hls.js requests are mocked on the same path as fetch.
 */

import { deflateSync } from 'node:zlib';

import { DEFAULT_SCENARIO, SCENARIOS } from './fixtures.js';
import { handleMockRequest } from './handlers.js';

const MOCK_BASE = '/__mock';
const SERVICES = new Set(['api', 'athena', 'billing', 'assets', 'files', 'upload']);

/* ---------------------------------------------------------------- sprite --- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/**
 * A 1536x80 strip of 12 frames, matching the real qcamera sprite geometry that
 * src/components/Timeline/thumbnails.jsx assumes (12 per file, 5s each).
 * Frames step through hues so scrubbing visibly moves between thumbnails.
 */
function buildSprite() {
  const width = 1536;
  const height = 80;
  const frames = 12;
  const frameWidth = width / frames;
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x += 1) {
      const frame = Math.floor(x / frameWidth);
      const shade = 40 + frame * 10;
      const pixel = rowStart + 1 + x * 3;
      raw[pixel] = shade;
      raw[pixel + 1] = Math.min(255, shade + 25 + Math.floor((y / height) * 40));
      raw[pixel + 2] = Math.min(255, shade + 60);
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', (() => {
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(width, 0);
      ihdr.writeUInt32BE(height, 4);
      ihdr[8] = 8; // bit depth
      ihdr[9] = 2; // colour type: truecolour
      return ihdr;
    })()),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

let spriteCache = null;
function sprite() {
  if (!spriteCache) spriteCache = buildSprite();
  return spriteCache;
}

/* ----------------------------------------------------------------- utils --- */

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', () => resolve(''));
  });
}

function parseBody(raw, contentType = '') {
  if (!raw) return null;
  if (contentType.includes('x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function send(response, status, headers, body) {
  response.statusCode = status;
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
  response.end(body);
}

/* ---------------------------------------------------------------- plugin --- */

export default function mockApiPlugin(env = {}) {
  const scenario = SCENARIOS.includes(env.VITE_MOCK_SCENARIO)
    ? env.VITE_MOCK_SCENARIO
    : DEFAULT_SCENARIO;

  return {
    name: 'connect-mock-api',
    apply: 'serve',

    configResolved() {
      if (!SCENARIOS.includes(env.VITE_MOCK_SCENARIO ?? DEFAULT_SCENARIO)) {
        console.warn(`[mock] unknown VITE_MOCK_SCENARIO "${env.VITE_MOCK_SCENARIO}", using "${scenario}"`);
      }
      console.info(`[mock] serving fake comma backend at ${MOCK_BASE} (scenario: ${scenario})`);
    },

    // Seed the auth token before the app bundle runs, so MyCommaAuth.init()
    // finds a session. The 'anonymous' scenario intentionally leaves it unset
    // so the signed-out landing page renders.
    transformIndexHtml() {
      const script = scenario === 'anonymous'
        ? "try { localStorage.removeItem('authorization'); } catch (e) {}"
        : "try { localStorage.setItem('authorization', 'mock-token'); } catch (e) {}";
      return [{ tag: 'script', injectTo: 'head-prepend', children: script }];
    },

    configureServer(server) {
      server.middlewares.use(MOCK_BASE, async (request, response, next) => {
        const host = request.headers.host ?? 'localhost';
        const origin = `http://${host}`;
        const url = new URL(request.url ?? '/', origin);

        if (request.method === 'OPTIONS') {
          return send(response, 204, {
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
          }, '');
        }

        const parts = url.pathname.replace(/^\/+/, '').split('/');
        const service = parts.shift();
        if (!SERVICES.has(service)) return next();

        const rawBody = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)
          ? await readBody(request)
          : '';

        let result;
        try {
          result = handleMockRequest({
            service,
            method: request.method,
            path: decodeURIComponent(parts.join('/')),
            query: Object.fromEntries(url.searchParams),
            body: parseBody(rawBody, request.headers['content-type'] ?? ''),
            origin,
            scenario,
            now: Date.now(),
          });
        } catch (error) {
          console.error(`[mock] handler threw for ${request.method} ${url.pathname}`, error);
          return send(response, 500, { 'Content-Type': 'application/json' }, JSON.stringify({ error: String(error) }));
        }

        if (!result) {
          // Loud on purpose: an unmatched route means the fixtures have drifted
          // from src/api.js and some feature is about to silently misbehave.
          console.warn(`[mock] no handler for ${request.method} ${url.pathname}`);
          return send(response, 501, { 'Content-Type': 'application/json' }, JSON.stringify({
            error: 'no mock handler',
            method: request.method,
            path: url.pathname,
          }));
        }

        if (result.sprite) {
          return send(response, result.status, { 'Content-Type': 'image/png' }, sprite());
        }
        if (result.text !== undefined) {
          return send(response, result.status, { 'Content-Type': result.contentType }, result.text);
        }
        return send(response, result.status, { 'Content-Type': 'application/json' }, JSON.stringify(result.json));
      });
    },
  };
}
