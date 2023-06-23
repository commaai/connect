const config = require ('./jest-puppeteer.config');

config['server']['command'] = 'serve -s -l 3003 build';

module.exports = config;
