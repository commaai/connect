/**
 * Numeric timeline bounds — the trailing `/{start}/{end}` on a shared link.
 *
 * @param {string} param
 * @returns {boolean}
 */
export function match(param) {
  return /^\d+$/.test(param);
}
