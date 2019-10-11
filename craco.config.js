/* eslint-disable */
const { removeLoaders, loaderByName } = require('@craco/craco');
const WorkerLoaderPlugin = require('craco-worker-loader');
const SentryPlugin = require('craco-sentry-plugin');

module.exports = function ({ env }) {
  const plugins = [{
    plugin: WorkerLoaderPlugin
  }];
  if (env === 'production') {
    plugins.push({
      plugin: SentryPlugin
    });
  }
  return {
    plugins,
    jest: {
      configure: (jestConfig, { env, paths }) => {
        jestConfig.testPathIgnorePatterns = ['node_modules', '__puppeteer__'];
        return jestConfig;
      }
    },
    webpack: {
      configure: (webpackConfig, { env, paths }) => {
        webpackConfig.output.globalObject = 'this';
        removeLoaders(webpackConfig, loaderByName('eslint-loader'));
        webpackConfig.optimization.minimizer = webpackConfig.optimization.minimizer.map(function (plugin) {
          if (plugin.constructor.name !== 'TerserPlugin') {
            return plugin;
          }
          plugin.options.terserOptions.keep_fnames = true;
          return plugin;
        });
        return webpackConfig;
      }
    }
  };
};
