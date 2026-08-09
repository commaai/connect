/**
 * Build an application/x-www-form-urlencoded query string.
 * - Omits null/undefined (intentional; saner than query-string's bare keys).
 * - Arrays become repeated keys (query-string arrayFormat: 'none').
 */
export function stringifyQuery(params) {
  const search = new URLSearchParams();
  if (!params) {
    return '';
  }
  for (const [key, value] of Object.entries(params)) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) {
          search.append(key, item);
        }
      }
    } else {
      search.set(key, value);
    }
  }
  return search.toString();
}
