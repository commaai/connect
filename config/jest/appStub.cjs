// SvelteKit generates the `$app/*` modules at build time, so a module importing
// one is unresolvable under jest. The unit tests only cover pure logic; anything
// that actually reaches navigation or page state belongs in a component test.
module.exports = new Proxy({}, {
  get(_target, name) {
    if (name === '__esModule') return true;
    return () => {
      throw new Error(`$app is not available under jest (used: ${String(name)})`);
    };
  },
});
