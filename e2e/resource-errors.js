export function unexpectedResourceErrors(errors, missingSegments, retiredCapabilityWorkers = new Set()) {
  return errors.filter(error => !(retiredCapabilityWorkers.has(error.url) && error.text === 'Failed to load resource') && !(missingSegments.has(error.url)
    && ['Failed to load resource', 'Failed to load resource: the server responded with a status of 404 (Not Found)'].includes(error.text)));
}
