/* eslint-env jest */
import puppeteer from 'puppeteer';

const width = 1600;
const height = 1200;

jest.setTimeout(60000);

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('demo mode', () => {
  let browser;
  let page;

  beforeEach(async () => {
    await delay(500);
  });
  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      slowMo: 80,
      args: [`--window-size=${width},${height}`],
    });
    page = await browser.newPage();
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 1,
    });
    await page.goto('http://localhost:3003/?demo=1');
    // wait for the data to start loading...
    await delay(8000);

    return true;
  });
  afterAll(async () => {
    await page.close();
    await browser.close();
    return true;
  });

  it('should load', async () => {
    await expect(page).toClick('.DriveEntry');
    await delay(2000);

    let video = await page.$('video');
    let videoSrc = await page.evaluate(vid => vid.getAttribute('src'), video);
    expect(videoSrc.startsWith('blob:')).toBeTruthy();

    // puppeteer chromium cannot play mp4, so change source to something it can play
    await page.evaluate(vid => {
      vid.setAttribute('src', 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm');
      vid.play();
    }, video);

    async function expectCanvasToChange(canvasHandle, wait = 5000) {
      let start = Date.now();
      let origDataUrl = await page.evaluate(canvas => canvas.toDataURL(), canvasHandle);
      let dataUrl;
      while (Date.now() < (start + wait)) {
        dataUrl = await page.evaluate(canvas => canvas.toDataURL(), canvasHandle);
        if (origDataUrl !== dataUrl) {
          break;
        }
      }
      expect(dataUrl).not.toEqual(origDataUrl);
    }

    let hudRoadCanvas = await page.$('.hudRoadCanvas');
    expect(hudRoadCanvas).toBeTruthy();
    await expectCanvasToChange(hudRoadCanvas);
  });
});
