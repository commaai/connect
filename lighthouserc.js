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
        'http://localhost/3533c53bb29502d1',
        'http://localhost/3533c53bb29502d1/1575969207023/1575976457225/',
      ],
    },
  },
};
