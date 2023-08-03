/* eslint-env jest */
import { configureViewport, goto } from './utils';

jest.setTimeout(30000);

describe('routing', () => {
  beforeAll(async () => {
    await configureViewport();
  });

  it('login page', async () => {
    await goto('/');
    await page.waitForXPath('//*[contains(string(), "Try the demo")]');
  });

  it('load route list', async () => {
    await goto('/a2a0ccea32023010');

    await page.waitForSelector('.DriveList');
    await page.waitForSelector('.DriveEntry');

    // Page should have one ".DriveEntry" element
    const driveEntries = await page.$$('.DriveEntry');
    expect(driveEntries.length).toBe(1);
  });

  it('load route from URL', async () => {
    await goto('/a2a0ccea32023010/1690488081496/1690488851596', { timeout: 60000 });

    const video = await page.waitForSelector('video');

    // Wait for video src to be set
    await page.waitForFunction(
      (vid) => vid.getAttribute('src') !== '',
      {},
      video,
    );

    const videoSrc = await page.evaluate((vid) => vid.getAttribute('src'), video);
    expect(videoSrc.startsWith('blob:')).toBeTruthy();
  }, 60000);
});
