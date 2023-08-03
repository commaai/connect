/* eslint-env jest */
import { configureViewport, goto, sleep } from './utils';

jest.setTimeout(60000);

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
    await sleep(2000);

    // ".DriveList" should be visible
    const driveList = await page.$('.DriveList');
    expect(driveList).toBeTruthy();

    // Page should have one ".DriveEntry" element
    const driveEntries = await page.$$('.DriveEntry');
    expect(driveEntries.length).toBe(1);
  });

  it('load route from URL', async () => {
    await goto('/a2a0ccea32023010/1690488081496/1690488851596');
    await sleep(10000);

    // Should load video with src
    const video = await page.$('video');
    expect(video).toBeTruthy();
    const videoSrc = await page.evaluate((vid) => vid.getAttribute('src'), video);
    expect(videoSrc.startsWith('blob:')).toBeTruthy();
  });
});
