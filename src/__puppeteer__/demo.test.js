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
    await page.goto('http://localhost:3003/4cf7a6ad03080c90');
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
    const list = await expect(page).toMatchElement('.DriveList');
    expect((await list.$$(':scope > a')).length).toBe(1);

    await expect(page).toClick('.DriveEntry');
    await delay(3000);

    const video = await page.$('video');
    const videoSrc = await page.evaluate((vid) => vid.getAttribute('src'), video);
    expect(videoSrc.startsWith('blob:')).toBeTruthy();
  });
});
