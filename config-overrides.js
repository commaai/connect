const SentryCliPlugin = require('@sentry/webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const path = require('path');

module.exports = override;

function override (config, env) {
  // config.entry = {
  //   bundle: path.join(__dirname, 'src/index.js'),
  //   worker: path.join(__dirname, 'timeline/index.js')
  // };
  // config.output.filename = 'static/js/[name].js';

  // console.log(config.output);

  config.module.rules = config.module.rules || [];

  config.module.rules.push({
    test: /\.sharedworker\.js$/,
    include: path.resolve('./src/timeline'),
    use: [{
      loader: 'sharedworker-loader',
      options: {
        name: '[hash].sharedworker.js'
      }
    }, { loader: 'babel-loader' }]
  });
  config.module.rules.push({
    test: /\.worker\.js$/,
    include: path.resolve('./src/timeline'),
    use: [{ loader: 'worker-loader' }, { loader: 'babel-loader' }]
  });
  config.plugins = config.plugins.filter(p => p.constructor !== UglifyJsPlugin);
  if (env === 'production') {
    config.plugins.push(
      new SentryCliPlugin({
        include: '.',
        ignoreFile: '.sentrycliignore',
        ignore: ['node_modules', 'webpack.config.js', 'config-overrides.js'],
        configFile: 'sentry.properties',
      })
    );
  }

  return config;
};
