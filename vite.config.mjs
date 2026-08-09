import { copyFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

import mockApiPlugin from './config/mock/plugin.mjs';


function previewBranding() {
  return {
    name: 'preview-branding',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const srcDir = resolve(process.cwd(), 'public/preview-icons');
      const outDir = resolve(process.cwd(), 'dist');
      for (const file of readdirSync(srcDir)) {
        copyFileSync(resolve(srcDir, file), resolve(outDir, file));
      }
      console.log('[preview-branding] swapped in preview icons');
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  let sentryPlugin;
  if (mode === 'production' && process.env.SENTRY_AUTH_TOKEN) {
    sentryPlugin = sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: 'commaai',
      project: 'connect',
      sourcemaps: {
        filesToDeleteAfterUpload: ['**/*.map'],
      },
    });
  }

  return {
    server: {
      port: 3000,
      // Local development can use the same Athena client through a same-origin path.
      proxy: {
        '/athena': {
          target: 'https://athena.comma.ai',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/athena/, ''),
        },
      },
    },
    build: {
      // Required for Sentry
      sourcemap: true,
    },
    plugins: [
      // TODO: compression plugin
      tailwindcss(),
      sveltekit(),
      sentryPlugin,
      env.VITE_MOCK_API === 'true' && mockApiPlugin(env),
      process.env.PREVIEW && previewBranding(),
    ].filter(Boolean),
  };
});
