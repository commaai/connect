module.exports = {
  ci: {
    upload: {
      target: 'temporary-public-storage',
    },
    collect: {
      staticDistDir: 'dist',
      isSinglePageApplication: true,
      url: [
        'http://localhost/',
        'http://localhost/a2a0ccea32023010',
        'http://localhost/a2a0ccea32023010/1690488081496/1690488851596/',
      ],
      numberOfRuns: 6,
    },
  },
};
