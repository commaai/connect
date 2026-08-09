/**
 * Route log ids are 20 characters of hex and dashes, e.g. `0000010a--a51155e496`.
 *
 * This is what lets `/{dongleId}/prime` and `/{dongleId}/{logId}` coexist as
 * sibling routes: 'prime' and 'stream' fail this test, so SvelteKit resolves
 * them to their own pages without any ordering rules.
 *
 * @param {string} param
 * @returns {boolean}
 */
export function match(param) {
  return /^[a-f0-9-]{20}$/.test(param);
}
