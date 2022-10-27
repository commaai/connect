export const KM_PER_MI = 1.60934;

let metric = null;

export const isMetric = () => {
  if (metric === null) {
    // Only a few countries use imperial measurements
    metric = ['en-us', 'en-gb', 'my'].indexOf(window.navigator.language.toLowerCase()) === -1;
  }

  return metric;
};
