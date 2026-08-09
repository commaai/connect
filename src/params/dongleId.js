/**
 * Dongle ids are 16 lowercase hex characters.
 *
 * Replaces the positional `dongleIdRegex` check in the old src/url.js. Making
 * it a matcher means `/1d3dc3e03047b0c7` and `/auth` can never be confused,
 * which the old parser only avoided by special-casing 'auth' by name.
 *
 * @param {string} param
 * @returns {boolean}
 */
export function match(param) {
  return /^[a-f0-9]{16}$/.test(param);
}
