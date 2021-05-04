module.exports = {
  server: {
    command: 'PORT=3003 env-cmd .env.development craco start',
    port: 3003,
    launchTimeout: 10000,
    debug: true,
  },
};
