import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

/**
 * Vitest rather than the app's vite config, because the SvelteKit plugin wants a
 * real routing manifest and the `$app/*` modules it generates only exist during a
 * kit build. The svelte plugin on its own compiles components, and the aliases
 * below stand in for what kit would have provided.
 */
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    // Components are client-side only; without this the svelte package resolves
    // to its server build and mounting a component throws.
    conditions: ['browser'],
    alias: {
      $lib: resolve('src/lib'),
      '$app/navigation': resolve('config/vitest/app-navigation.js'),
      '$app/state': resolve('config/vitest/app-state.js'),
      '$app/environment': resolve('config/vitest/app-environment.js'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.js'],
    setupFiles: ['config/vitest/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'src/**/*.svelte'],
      exclude: ['src/**/*.test.js'],
    },
  },
});
