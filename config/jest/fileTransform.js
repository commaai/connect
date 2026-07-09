"use strict";

const path = require("path");

// Custom Jest transformer: turn file imports into basenames.
// http://facebook.github.io/jest/docs/en/webpack.html

module.exports = {
  process(src, filename) {
    return `module.exports = ${JSON.stringify(path.basename(filename))};`;
  },
};
