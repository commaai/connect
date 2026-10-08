/* eslint-disable no-console */
// Headless-browser check of the video-driven player against /demo routes,
// so playback can be tested without a comma. Start the dev server first
// (`bun start`), then: `bun run test:e2e`.
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://localhost:3001';
const shot = (name) => path.join(os.tmpdir(), name);
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err)));

const videoState = () => page.evaluate(() => {
  const video = document.querySelector('video');
  if (!video) return null;
  return {
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    readyState: video.readyState,
    playbackRate: video.playbackRate,
    muted: video.muted,
    ended: video.ended,
  };
});
const timeDisplayText = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('span')].find((s) => /^\d\d:\d\d:\d\d/.test(s.textContent || ''));
  return el ? el.textContent : null;
});
const rulerLeft = () => page.evaluate(() => {
  const ruler = document.querySelector('[aria-label="Drive timeline"]');
  return ruler && ruler.firstElementChild ? ruler.firstElementChild.style.left : null;
});
const clickButton = (label) => page.evaluate((name) => {
  const el = [...document.querySelectorAll('button')]
    .find((b) => (b.getAttribute('aria-label') || '').includes(name));
  if (el) el.click();
  return Boolean(el);
}, label);

try {
  // ---- open the demo dashboard and the first demo route ----
  await page.goto(`${BASE}/deadbeefdeadbeef`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(
    () => document.body.innerText.toLowerCase().includes('epoch date/time (no clock)'),
    { timeout: 30000 },
  );
  check('demo dashboard shows demo routes', true);

  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')]
      .find((n) => n.children.length === 0 && (n.textContent || '').includes('Epoch date/time'));
    (el.closest('[class]') || el).click();
  });
  await page.waitForSelector('video', { timeout: 30000 });
  check('route opens with a video element', true);

  // ---- the video plays ----
  let state = null;
  for (let i = 0; i < 60; i++) {
    state = await videoState();
    if (state && state.readyState >= 3 && !state.paused && state.currentTime > 0.2) break;
    await sleep(500);
  }
  check(
    'video loads and starts playing (hls.js path on Chrome)',
    Boolean(state && state.readyState >= 3 && !state.paused && state.currentTime > 0.2),
    JSON.stringify(state),
  );

  // ---- the video drives the UI ----
  const t1 = state.currentTime;
  const display1 = await timeDisplayText();
  const ruler1 = await rulerLeft();
  await sleep(2500);
  const state2 = await videoState();
  const display2 = await timeDisplayText();
  const ruler2 = await rulerLeft();
  check('video clock advances', state2.currentTime > t1 + 1, `${t1} -> ${state2.currentTime}`);
  check('time display follows the video', display1 !== display2, `${display1} -> ${display2}`);
  check('timeline ruler follows the video', ruler1 !== ruler2, `${ruler1} -> ${ruler2}`);

  // ---- pause / resume ----
  await clickButton('Pause');
  await sleep(700);
  const pausedState = await videoState();
  const pausedRuler = await rulerLeft();
  check('pause stops the video', pausedState.paused === true, JSON.stringify(pausedState));
  await sleep(900);
  const pausedRuler2 = await rulerLeft();
  check('timeline is frozen while paused', pausedRuler === pausedRuler2, `${pausedRuler} -> ${pausedRuler2}`);
  await clickButton('Unpause');
  await sleep(1200);
  const resumedState = await videoState();
  check('resume plays again', resumedState.paused === false, JSON.stringify(resumedState));

  // ---- seeking from the timeline ----
  const rulerBox = await page.evaluate(() => {
    const ruler = document.querySelector('[aria-label="Drive timeline"]');
    const r = ruler.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.mouse.click(rulerBox.x + rulerBox.width * 0.6, rulerBox.y + rulerBox.height / 2);
  await sleep(1500);
  const seekedState = await videoState();
  const expected = 0.6 * seekedState.duration;
  check(
    'timeline click seeks the video',
    Math.abs(seekedState.currentTime - expected) < Math.max(3, seekedState.duration * 0.05),
    `expected ~${expected.toFixed(1)}s got ${seekedState.currentTime.toFixed(1)}s`,
  );

  // ---- speed change moves the element's rate ----
  const hadIncrease = await clickButton('Increase play speed');
  await sleep(500);
  const fastState = await videoState();
  check('speed control changes playbackRate', hadIncrease && fastState.playbackRate === 2, `rate=${fastState.playbackRate}`);
  await clickButton('Decrease play speed');
  await sleep(300);

  // ---- mute toggle (only when the route has audio) ----
  const muteInfo = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')]
      .find((b) => ['Mute', 'Unmute'].includes(b.getAttribute('aria-label') || ''));
    if (!el) return { found: false };
    return { found: true, disabled: el.disabled, muted: document.querySelector('video').muted };
  });
  check('mute button reflects the audio track', muteInfo.found, JSON.stringify(muteInfo));
  if (muteInfo.found && !muteInfo.disabled) {
    await clickButton(muteInfo.muted ? 'Unmute' : 'Mute');
    await sleep(300);
    const afterMute = await videoState();
    check('mute toggle reaches the element', afterMute.muted !== muteInfo.muted, `${muteInfo.muted} -> ${afterMute.muted}`);
    await clickButton(afterMute.muted ? 'Unmute' : 'Mute');
  } else if (muteInfo.found) {
    check('mute button is disabled for a route without audio', muteInfo.disabled === true);
  }

  // ---- loop wrap near the end of the route ----
  await page.mouse.click(rulerBox.x + rulerBox.width * 0.99, rulerBox.y + rulerBox.height / 2);
  let wrappedState = await videoState();
  const seekedAt = wrappedState.currentTime;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    wrappedState = await videoState();
    if (wrappedState.currentTime < seekedAt - 1) break;
  }
  check(
    'playback loops back to the start',
    wrappedState.currentTime < seekedAt - 1,
    `at ${wrappedState.currentTime.toFixed(1)}s (was ${seekedAt.toFixed(1)}s)`,
  );

  // ---- map view / video view switch keeps the clock ----
  await page.evaluate(() => {
    const option = [...document.querySelectorAll('div')]
      .find((n) => n.textContent.trim() === 'Video'
        && [...n.parentElement.children].some((c) => c.textContent.trim() === 'Map'));
    if (option) option.parentElement.querySelector(':scope > *:last-child').click();
  });
  await sleep(1000);
  const noVideo = await page.evaluate(() => !document.querySelector('video'));
  check('map view unmounts the video', noVideo);
  await sleep(2000);
  await page.evaluate(() => {
    const option = [...document.querySelectorAll('div')]
      .find((n) => n.textContent.trim() === 'Map'
        && [...n.parentElement.children].some((c) => c.textContent.trim() === 'Video'));
    if (option) option.parentElement.querySelector(':scope > *:first-child').click();
  });
  let remounted = null;
  for (let i = 0; i < 30; i++) {
    remounted = await videoState();
    if (remounted && remounted.readyState >= 3 && !remounted.paused) break;
    await sleep(500);
  }
  check(
    'video view resumes playback after returning',
    Boolean(remounted && remounted.readyState >= 3 && !remounted.paused),
    JSON.stringify(remounted),
  );

  await page.screenshot({ path: shot('drive-video-playing.png') });

  // ---- missing qcamera route shows the error state ----
  await page.goto(`${BASE}/deadbeefdeadbeef/00000000--0000000007`, { waitUntil: 'networkidle2', timeout: 60000 });
  let errorText = null;
  for (let i = 0; i < 30; i++) {
    errorText = await page.evaluate(() => document.body.innerText);
    if (errorText.includes('not uploaded yet')) break;
    await sleep(500);
  }
  check('missing video shows the friendly error', errorText.includes('not uploaded yet'));
  const hasRetry = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Try again')));
  check('error state offers a retry', hasRetry);
  await page.screenshot({ path: shot('drive-video-error.png') });

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
} catch (err) {
  check('e2e run completed', false, String(err));
  await page.screenshot({ path: shot('drive-video-failure.png') }).catch(() => {});
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
