/* eslint-env jest */
import { configureViewport, goto, sleep } from './utils';

jest.setTimeout(60000);

describe('demo mode', () => {
  beforeAll(async () => {
    configureViewport();
  });

  it('should load demo route', async () => {
    await goto('/a2a0ccea32023010', { waitUntil: 'networkidle2' });
    await sleep(2500);

    const list = await expect(page).toMatchElement('.DriveList');
    expect((await list.$$(':scope > a')).length).toBe(1);

    await expect(page).toClick('.DriveEntry');
    await sleep(10000);

    const video = await page.$('video');
    const videoSrc = await page.evaluate((vid) => vid.getAttribute('src'), video);
    expect(videoSrc.startsWith('blob:')).toBeTruthy();
  });
});
