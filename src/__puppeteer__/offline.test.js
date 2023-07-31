/* eslint-env jest */
import { configureViewport, goto } from './utils';

jest.setTimeout(60000);

describe('offline', () => {
  beforeAll(async () => {
    configureViewport();
  });

  it('should not crash when navigating while offline', async () => {
    await goto('/4cf7a6ad03080c90');
    await page.waitForSelector('.DriveEntry', { timeout: 10000 });

    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'networkidle0' });

    expect(await page.$x('//*[contains(string(), "Rav4")]')).toBeTruthy();
    expect(await page.$x('//*[contains(string(), "Loading...")]')).toBeTruthy();
  });
});
