module.exports = {
  ci: {
    upload: {
      target: 'temporary-public-storage',
    },
    collect: {
      staticDistDir: 'build',
      isSinglePageApplication: true,
      url: [
        'http://localhost/',
        'http://localhost/4cf7a6ad03080c90',
        'http://localhost/4cf7a6ad03080c90/1632948396703/1632949028503/',
      ],
      numberOfRuns: 5,
    },
  },
};
