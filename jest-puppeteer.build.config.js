const config = require('./jest-puppeteer.config');

module.exports = {
  ...config,
  server: {
    ...config['server'],
    command: 'bun serve --port 3003',
  },
};
