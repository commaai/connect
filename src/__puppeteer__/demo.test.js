/* eslint-env jest */
const sleep = async (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const width = 1600;
const height = 1200;

jest.setTimeout(60000);

describe('demo mode', () => {
  beforeEach(async () => {
    await sleep(500);
  });
  beforeAll(async () => {
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 1,
    });
    await page.goto('http://localhost:3003/4cf7a6ad03080c90');
    // wait for the data to start loading...
    await sleep(5000);
  });

  it('should load', async () => {
    const list = await expect(page).toMatchElement('.DriveList');
    expect((await list.$$(':scope > a')).length).toBe(1);

    await expect(page).toClick('.DriveEntry');
    await sleep(3000);

    const video = await page.$('video');
    const videoSrc = await page.evaluate((vid) => vid.getAttribute('src'), video);
    expect(videoSrc.startsWith('blob:')).toBeTruthy();
  });
});
