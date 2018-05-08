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
        name: '[hash].worker.js'
      }
    }, { loader: 'babel-loader' }]
  });
  config.module.rules.push({
    test: /\.worker\.js$/,
    include: path.resolve('./src'),
    use: [{ loader: 'worker-loader' }, { loader: 'babel-loader' }]
  });

  return config;
};
