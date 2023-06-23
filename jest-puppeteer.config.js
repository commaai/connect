const width = 1600;
const height = 1200;

module.exports = {
  launch: {
    headless: "new",
    slowMo: 80,
    args: [`--window-size=${width},${height}`],
  },
  server: {
    command: 'PORT=3003 env-cmd .env.development craco start',
    port: 3003,
    launchTimeout: 15000,
    debug: true,
  },
};
