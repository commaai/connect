import config from './jest-puppeteer.config';

config['server']['command'] = 'pnpm serve --port 3003';

module.exports = config;
