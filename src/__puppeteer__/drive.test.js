/* eslint-env jest */
import { configureViewport, goto } from './utils';

const DEMO_DEVICE_URL = '/1d3dc3e03047b0c7';
const DEMO_ROUTE_URL = '/1d3dc3e03047b0c7/000000dd--455f14369d';
const ZOOMED_DEMO_URL = '/1d3dc3e03047b0c7/000000dd--455f14369d/109/423';

jest.setTimeout(60000);

describe('drive view', () => {
  beforeAll(async () => {
    await configureViewport();

    // Log in to demo account
    await goto('/');
    await page.click('xpath=//a[contains(string(), "Try the demo")]');
  });

  it('back button disabled when in route bounds', async () => {
    await goto(DEMO_ROUTE_URL);
    await page.waitForSelector('.DriveView', { timeout: 10000 });

    const backButton = await page.$('.DriveView button[aria-label="Go Back"]');

    expect(backButton).toBeTruthy();
    expect(await backButton.evaluate((button) => button.hasAttribute('disabled'))).toBeTruthy();
  });

  it('back button selects route bounds if timeline is zoomed when clicked', async () => {
    await goto(ZOOMED_DEMO_URL); // +1/-1 seconds
    await page.waitForSelector('.DriveView', { timeout: 10000 });

    const backButton = await page.$('.DriveView button[aria-label="Go Back"]');

    expect(await backButton.evaluate((button) => button.hasAttribute('disabled'))).toBeFalsy();

    await Promise.all([
      page.waitForNavigation(),
      backButton.click(),
    ]);

    expect(page.url().endsWith(DEMO_ROUTE_URL)).toBeTruthy();
  });

  it('close button navigates to drive list when clicked', async () => {
    await goto(DEMO_ROUTE_URL);
    await page.waitForSelector('.DriveView', { timeout: 10000 });

    const closeButton = await page.$('.DriveView a[aria-label="Close"]');

    expect(closeButton).toBeTruthy();

    await Promise.all([
      page.waitForNavigation(),
      closeButton.click(),
    ]);

    expect(page.url().endsWith(DEMO_DEVICE_URL)).toBeTruthy();
  });
});
