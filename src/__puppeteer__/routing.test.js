/* eslint-env jest */
const sleep = async (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const PORT = 3003;

const width = 1600;
const height = 1200;

jest.setTimeout(60000);

describe('routing', () => {
  beforeAll(async () => {
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 1,
    });
  });

  it('load route from URL', async () => {
    await page.goto(`http://localhost:${PORT}/4cf7a6ad03080c90/1632948396703/1632949028503`, { waitUntil: 'networkidle2' });
    await sleep(10000);

    const video = await page.$('video');
    expect(video).toBeTruthy();
    const videoSrc = await page.evaluate((vid) => vid.getAttribute('src'), video);
    expect(videoSrc.startsWith('blob:')).toBeTruthy();
  });
});
