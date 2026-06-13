// Standalone headless driver for webrtc-latency-runner.html (not a jest test).
// Usage: node src/__puppeteer__/webrtc-latency-headless.mjs
// Env: DONGLE_ID, ATTEMPTS, TOKEN_FILE, OUT, PORT, CHROME
import fs from 'fs';
import puppeteer from 'puppeteer';

const PORT = Number(process.env.PORT || 3003);
const DONGLE_ID = process.env.DONGLE_ID || 'd0610b2c9971d926';
const ATTEMPTS = Number(process.env.ATTEMPTS || 12);
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE || '/tmp/comma-user-token.txt', 'utf8').trim();
const OUT = process.env.OUT || '/tmp/webrtc-latency-results.json';
const EXECUTABLE = process.env.CHROME || '/usr/bin/google-chrome';

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: EXECUTABLE,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  protocolTimeout: 30 * 60 * 1000,
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[browser]', m.text()); });
  await page.evaluateOnNewDocument((t) => localStorage.setItem('authorization', t), TOKEN);
  await page.goto(`http://localhost:${PORT}/src/__puppeteer__/webrtc-latency-runner.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__webrtcLatencyReady === true && typeof window.runWebrtcLatencyTest === 'function',
    { timeout: 30000 },
  );

  console.log(`Running ${ATTEMPTS} attempts against ${DONGLE_ID}...`);
  const payload = await page.evaluate(async (cfg) => {
    try {
      return { result: await window.runWebrtcLatencyTest(cfg) };
    } catch (err) {
      return { error: { message: err.message, stack: err.stack }, state: window.__webrtcLatencyState };
    }
  }, { attempts: ATTEMPTS, dongleId: DONGLE_ID, token: TOKEN, attemptDeadlineMs: 20000 });

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT}`);

  const results = payload.result?.results || payload.state?.results || [];
  for (const r of results) {
    const ms = (v) => (v == null ? '-' : v.toFixed(0));
    console.log(`attempt ${r.attempt}: ${r.status} connect=${ms(r.elapsedMs)}ms firstFrame=+${ms(r.firstFrameMs)}ms total=${ms(r.totalMs)}ms link=${ms(r.linkMs)}ms device=${ms(r.deviceMs)}ms${r.reason ? ` (${r.reason})` : ''}`);
  }
  if (payload.error) {
    console.error('RUN ERROR:', payload.error.message);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
