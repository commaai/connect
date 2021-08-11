module.exports = {
  ci: {
    upload: {
      target: 'temporary-public-storage',
    },
    collect: {
      startServerCommand: 'yarn serve -s -C build',
      url: [
        'http://localhost/',
        'http://localhost/?demo=1',
        'http://localhost/3533c53bb29502d1/1575969207023/1575976457225/?demo=1',
      ],
    },
  },
};
