module.exports = {
  ci: {
    upload: {
      target: 'temporary-public-storage',
    },
    collect: {
      startServerCommand: 'yarn serve -s -C -l 3000 build',
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/?demo=1',
        'http://localhost:3000/3533c53bb29502d1/1575969207023/1575976457225/?demo=1',
      ],
    },
  },
};
