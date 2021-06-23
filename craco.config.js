/* eslint-disable */
const { removeLoaders, loaderByName, addBeforeLoader } = require('@craco/craco');
const SentryPlugin = require('craco-sentry-plugin');

module.exports = function ({ env }) {
  const plugins = [{
    plugin: {
      overrideWebpackConfig: ({ pluginOptions, webpackConfig, context: { env } }) => {
        const workerLoader = {
          test: /\.worker\.js/,
          use: {
            loader: "worker-loader",
            options: pluginOptions || {}
          }
        };
        addBeforeLoader(webpackConfig, loaderByName("babel-loader"), workerLoader);
        return webpackConfig;
      }
    }
  }];
  if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_SENTRY_ENV) {
    plugins.push({
      plugin: {
        overrideWebpackConfig: ({ pluginOptions, webpackConfig, context: { env } }) => {
          const sentryPlugin = new SentryCliPlugin({
            include: './build/',
            ignoreFile: '.sentrycliignore',
            ignore: ['node_modules', 'webpack.config.js', 'craco.config.js'],
            configFile: 'sentry.properties',
            ...pluginOptions
          });
          webpackConfig.plugins.push(sentryPlugin);
          return webpackConfig;
        }
      }
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
