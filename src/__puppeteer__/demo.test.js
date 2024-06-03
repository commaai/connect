/* eslint-env jest */
import { configureViewport, goto } from './utils';

jest.setTimeout(30000);

describe('demo mode', () => {
  beforeAll(async () => {
    await configureViewport();
  });

  it('should load demo route', async () => {
    await goto('/');
    await page.click('xpath=//a[contains(string(), "Try the demo")]');

    await page.waitForSelector('.DriveList');
    await page.waitForSelector('.DriveEntry');
    await expect(page).toClick('.DriveEntry');

    // Wait for video src to be set
    await page.waitForFunction(
      (video) => video.getAttribute('src')?.startsWith('blob:'),
      {},
      await page.waitForSelector('video'),
    );
  });
});
