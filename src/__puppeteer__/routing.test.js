/* eslint-env jest */
import { configureViewport, goto } from './utils';

jest.setTimeout(30000);

describe('routing', () => {
  beforeAll(async () => {
    await configureViewport();

    // Log in to demo account
    await goto('/');
    await page.click('xpath=//a[contains(string(), "Try the demo")]');
  });

  it('load route list', async () => {
    await goto('/1d3dc3e03047b0c7');

    await page.waitForSelector('.DriveList');
    await page.waitForSelector('.DriveEntry');

    // Page should have at least one ".DriveEntry" element
    const driveEntries = await page.$$('.DriveEntry');
    expect(driveEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('load route from URL', async () => {
    await goto('/1d3dc3e03047b0c7/1716484475499/1716485004466', { timeout: 50000 });

    // Wait for video src to be set
    await page.waitForFunction(
      (video) => video.getAttribute('src')?.startsWith('blob:'),
      {},
      await page.waitForSelector('video'),
    );
  }, 80000);
});
