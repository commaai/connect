const PORT = 3003;

const WIDTH = 1600;
const HEIGHT = 1200;

export const configureViewport = async () => {
  await page.setViewport({
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
  });
};

export const goto = async (path, options) => {
  await page.goto(`http://localhost:${PORT}${path}`, {
    waitUntil: 'domcontentloaded',
    ...options,
  });
};
