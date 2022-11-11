/* eslint-disable arrow-body-style */
module.exports = {
  GenerateSW: (options) => {
    // override GenerateSW config here
    // e.g. options.skipWaiting = true;
    options.skipWaiting = false;
    return options;
  },
  InjectManifest: (options) => {
    // override InjectManifest config here
    // e.g. options.maximumFileSizeToCacheInBytes = 10 * 1024 * 1024;
    return options;
  },
};
