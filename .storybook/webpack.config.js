const path = require('path');

module.exports = {
  module: {
    rules: [
      {
        test: /\.(c|sc|sa)ss$/,
        loaders: ['style-loader', 'css-loader', 'sass-loader'],
        include: path.resolve(__dirname, '../')
      }
    ]
  }
};
