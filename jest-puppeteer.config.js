const width = 1600;
const height = 1200;

module.exports = {
  launch: {
    headless: 'new',
    slowMo: 80,
    args: [`--window-size=${width},${height}`],
  },
  server: {
    command: 'env-cmd .env.development pnpm start --port 3003',
    port: 3003,
    launchTimeout: 15000,
    debug: true,
  },
};
