/**
 * Build an application/x-www-form-urlencoded query string.
 * Omits null/undefined values (matches query-string's default behavior).
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
    search.set(key, value);
  }
  return search.toString();
}
