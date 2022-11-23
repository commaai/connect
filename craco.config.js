const { loaderByName, addBeforeLoader } = require('@craco/craco');

const SentryCliPlugin = require('@sentry/webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const zlib = require('zlib');

const eslintConfig = require('./.eslintrc');

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

  let compressionPlugin;
  if (env === 'production') {
    compressionPlugin = new CompressionPlugin({
      filename: '[path][base].br',
      algorithm: 'brotliCompress',
      test: /\.(js|css|html|svg)$/,
      compressionOptions: {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        },
      },
      threshold: 10240,
      minRatio: 0.8,
      deleteOriginalAssets: false,
    });
  }

  return {
    eslint: {
      enable: false,
      config: eslintConfig,
    },
    webpack: {
      plugins: [
        sentryPlugin,
        compressionPlugin,
      ].filter(Boolean),
      configure: (webpackConfig) => {
        webpackConfig.output.globalObject = 'this';
        addBeforeLoader(webpackConfig, loaderByName('babel-loader'), {
          test: /\.worker\.js/,
          use: { loader: 'worker-loader' },
        });
        webpackConfig.optimization.minimizer.forEach((plugin) => {
          if (plugin.constructor.name !== 'TerserPlugin') {
            return;
          }
          plugin.options.terserOptions = { keep_fnames: true };
        });
        return webpackConfig;
      },
    },
    jest: {
      configure: (jestConfig) => ({
        ...jestConfig,
        moduleNameMapper: {
          '^@commaai/(.+)$': '<rootDir>/node_modules/@commaai/$1/dist/index.js',
        },
        testPathIgnorePatterns: ['node_modules', 'src/__puppeteer__'],
        transformIgnorePatterns: ['node_modules/(?!(@commaai/(.+))/)'],
      }),
    },
  };
};
