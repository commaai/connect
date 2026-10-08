export function unexpectedResourceErrors(errors, missingSegments) {
  return errors.filter(error => !(missingSegments.has(error.url)
    && ['Failed to load resource', 'Failed to load resource: the server responded with a status of 404 (Not Found)'].includes(error.text)));
}
