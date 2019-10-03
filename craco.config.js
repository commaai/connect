const WorkerLoaderPlugin = require("craco-worker-loader");
const SentryPlugin = require("craco-sentry-plugin");

module.exports = function({ env }) {
  var plugins = [{
    plugin: WorkerLoaderPlugin
  }];
  if (env === 'production') {
    plugins.push({
      plugin: SentryPlugin
    });
  }
  return {
    plugins: plugins,
    webpack: {
      configure: {
        output: {
          globalObject: "this"
        }
      }
    }
  };
};
