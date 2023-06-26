const config = require('./jest-puppeteer.config');

module.exports = {
  ...config,
  server: {
    ...config['server'],
    command: 'pnpm serve --port 3003',
  },
};
