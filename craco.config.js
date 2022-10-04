const { removeLoaders, loaderByName, addBeforeLoader } = require('@craco/craco');
const SentryCliPlugin = require('@sentry/webpack-plugin');
const { GenerateSW } = require('workbox-webpack-plugin');

module.exports = ({ env }) => {
  let sentryPlugin;
  if (env === 'production' && process.env.SENTRY_AUTH_TOKEN) {
    sentryPlugin = new SentryCliPlugin({
      include: './build/',
      ignoreFile: '.sentrycliignore',
      ignore: ['node_modules', 'webpack.config.js', 'craco.config.js'],
      configFile: 'sentry.properties',
    });
  }

  let workboxPlugin;
  if (env === 'production') {
    workboxPlugin = new GenerateSW({
      skipWaiting: true,
    });
  }

  return {
    jest: {
      configure: (jestConfig, { env, paths }) => ({
        ...jestConfig,
        testPathIgnorePatterns: ['node_modules', 'src/__puppeteer__'],
      }),
    },
    webpack: {
      configure: (webpackConfig, { env, paths }) => {
        if (workboxPlugin) {
          webpackConfig.plugins.push(workboxPlugin);
        }
        if (sentryPlugin) {
          webpackConfig.plugins.push(sentryPlugin);
        }
        webpackConfig.output.globalObject = 'this';
        addBeforeLoader(webpackConfig, loaderByName('babel-loader'), {
          test: /\.worker\.js/,
          use: { loader: 'worker-loader' },
        });
        removeLoaders(webpackConfig, loaderByName('eslint-loader'));
        webpackConfig.optimization.minimizer = webpackConfig.optimization.minimizer.map(function (plugin) {
          if (plugin.constructor.name !== 'TerserPlugin') {
            return plugin;
          }
          plugin.options.terserOptions.keep_fnames = true;
          return plugin;
        });
        return webpackConfig;
      },
    },
  };
};
