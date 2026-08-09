import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),

  kit: {
    // connect is a JWT-in-localStorage SPA served as static files from
    // Cloudflare Pages and nginx. `fallback` reproduces the SPA rewrite both
    // already do, and keeping the output in dist/ means Dockerfile,
    // deploy-preview.sh, and the gallery keep working unchanged.
    adapter: adapter({
      pages: 'dist',
      assets: 'dist',
      fallback: 'index.html',
      precompress: false,
      strict: false,
    }),

    // The repo has always kept static assets in public/, not static/.
    files: {
      assets: 'public',
    },

    alias: {
      $lib: 'src/lib',
    },

    typescript: {
      config: (config) => ({ ...config, include: [...(config.include ?? [])] }),
    },
  },
};
