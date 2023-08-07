/* eslint-env jest */
import { configureViewport, goto } from './utils';

jest.setTimeout(30000);

describe('offline', () => {
  beforeAll(async () => {
    await configureViewport();
  });

  it('should not crash when navigating while offline', async () => {
    await goto('/a2a0ccea32023010');
    await page.waitForSelector('.DriveEntry');

    await page.setOfflineMode(true);
    await page.setCacheEnabled(false);
    await page.reload({ waitUntil: 'networkidle0' });

    expect(await page.$x('//*[contains(string(), "Corolla")]')).toBeTruthy();
    expect(await page.$x('//*[contains(string(), "Loading...")]')).toBeTruthy();
  });
});
