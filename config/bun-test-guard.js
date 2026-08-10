/**
 * Preloaded by `bun test` only (see bunfig.toml), which is not how this project
 * runs its tests.
 *
 * Bun's own runner never reads vitest.config.js, so `$lib` and `$app/*` do not
 * resolve, `.svelte` files are not compiled, and config/vitest/setup.js — jsdom,
 * the jest-dom matchers, the localforage and mapbox-gl mocks — never loads. The
 * result is dozens of module-resolution failures that read like broken tests
 * rather than like the wrong command, so stop here and name the right one.
 */
console.error(`
bun test is not this project's test runner — use:

    bun run test              all suites, once
    bun run test-watch        re-run on change
    bun run test-coverage     with a coverage report

`);
process.exit(1);
