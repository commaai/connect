const TimelineWorker = require('./index.sharedworker');

module.exports = {
  getValue: getValue
};

var worker = new TimelineWorker();

worker.port.start();

function getValue () {
  worker.port.postMessage({
    foo: 'bar'
  });
}
